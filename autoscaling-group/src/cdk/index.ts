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

    // SSM Paramter
    const ssmParamValue = readFileSync(
      './configs/ssm-cw-agent-parameter.json',
      'utf8'
    );

    const cwAgentSSMParam = new ssm.StringParameter(this, 'SSM-Parameter-CWAgent', {
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

    const sshOnlySG = new ec2.SecurityGroup(this, 'EC2-Security-Group', {
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
    const ec2Role = new iam.Role(this, 'EC2-Role', {
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
    ).replace('#!/bin/bash', '').trim();

    const userData = ec2.UserData.forLinux();
    userData.addCommands(userDataScript);

    // Create Launch Template
    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
      instanceType: new ec2.InstanceType('t3.micro'),
      securityGroup: sshOnlySG,
      machineImage: ec2.MachineImage.genericLinux(
        amiMap.Mappings.RegionMap
      ),
      role: ec2Role,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(8)
        }
      ],
      userData: userData
    });

    cdk.Tags.of(launchTemplate).add('Name', 'memory-asg-server');

    // Create AutoScalingGroup
    const ASG = new autoscaling.AutoScalingGroup(this, 'AutoScaling-Group', {
      vpc: vpc,
      launchTemplate: launchTemplate,
      minCapacity: 1,
      maxCapacity: 2
    });

    // Create Scaling Policy
    const scaleOutStepScalingPolicy = new autoscaling.StepScalingPolicy(this, 'StepScaling-Policy', {
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
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false
  })
});