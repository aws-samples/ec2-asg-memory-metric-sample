#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { readFileSync } from 'fs';
import amiMap from './configs/ami-mapping.json';

class SampleASGMemoryMetricStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // AMI Mappings
    const amiRegionMap = new cdk.CfnMapping(this, 'RegionMap', {
      mapping: amiMap.Mappings.RegionMap
    });

    // SSM Paramter
    const ssmParamValue = readFileSync(
      './configs/ssm-cw-agent-parameter.json',
      'utf8'
    );

    const cwAgentSSMParam = new ssm.StringParameter(this, 'cwagent-config-ssm-param', {
      parameterName: '/cwagent/linux/asg',
      stringValue: ssmParamValue,
      description: 'Cloudwatch Agent Parameter',
      tier: ssm.ParameterTier.STANDARD
    });

    // VPC & Networking
    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        }
      ]
    });

    // Parameterize AZs for VPC Subnets
    vpc.publicSubnets.forEach((vpcSubnet, index) => {
      (vpcSubnet.node.defaultChild as ec2.CfnSubnet).availabilityZone = cdk.Fn.select(index, cdk.Fn.getAzs(cdk.Aws.REGION));
    });

    const sshOnlySG = new ec2.SecurityGroup(this, 'ec2-security-group', {
      vpc,
      allowAllOutbound: true,
      description: 'security group for SSH'
    });

    sshOnlySG.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'allow SSH access from anywhere'
    );

    cdk.Tags.of(sshOnlySG).add('Name', this.stackName + '-SG');

    // ec2 Role
    const ec2Role = new iam.Role(this, 'ec2-cw-agent-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
      ]
    });

    cdk.Tags.of(ec2Role).add('Name', this.stackName + '-iam-role');

    const userDataScript = readFileSync(
      './configs/userdata.sh',
      'utf8'
    ).replace('#!/bin/bash', '');

    const userData = ec2.UserData.forLinux();
    userData.addCommands(userDataScript);

    // Create Launch Template
    const launchTemplate = new ec2.LaunchTemplate(this, 'launch-template', {
      instanceType: new ec2.InstanceType('t3.micro'),
      securityGroup: sshOnlySG,
      machineImage: ec2.MachineImage.lookup({
        name: 'ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-*',
        owners: ['amazon']
      }),
      role: ec2Role,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(8)
        }
      ],
      userData: userData
    });

    // Parameterize AMI
    const cfnLaunchTemplate = launchTemplate.node.defaultChild as ec2.CfnLaunchTemplate;
    cfnLaunchTemplate.launchTemplateData['imageId'] = amiRegionMap.findInMap(cdk.Aws.REGION, 'HVM64');

    cdk.Tags.of(launchTemplate).add('Name', 'memory-asg-server');

    // Create AutoScalingGroup
    const ASG = new autoscaling.AutoScalingGroup(this, 'autoscaling-group', {
      vpc: vpc,
      launchTemplate: launchTemplate,
      minCapacity: 1,
      maxCapacity: 2
    });

    // Create Scaling Policy
    const scaleOutStepScalingPolicy = new autoscaling.StepScalingPolicy(this, 'stepscaling-policy', {
      autoScalingGroup: ASG,
      metric: new cloudwatch.Metric({
        metricName: "MemoryUtilization",
        namespace: "EC2_ASG_Memory",
        period: cdk.Duration.seconds(60),
        dimensionsMap: {
          AutoScalingGroupName: ASG.autoScalingGroupName
        }
      }),
      scalingSteps: [
        { upper: 20, change: -1},
        { lower: 30, change: +1}
      ],
      evaluationPeriods: 3,
      adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY
    });

    launchTemplate.node.addDependency(cwAgentSSMParam);
  }
}

const app = new cdk.App();

new SampleASGMemoryMetricStack(app, 'SampleASGMemoryMetric', {
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION
  },
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false
  })
});