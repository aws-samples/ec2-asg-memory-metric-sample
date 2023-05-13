#!/usr/bin/env node
import 'source-map-support/register';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { readFileSync } from 'fs';
import amiMap from './configs/ami-mapping.json';

class SampleEC2MemoryMetricStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // AMI Mappings
    const amiRegionMap = new cdk.CfnMapping(this, 'RegionMap', {
      mapping: amiMap.Mappings.RegionMap
    });

    // SSM Parameter
    const ssmParamValue = readFileSync(
      './configs/ssm-cw-agent-parameter.json',
      'utf8'
    );

    const cwAgentSSMParam = new ssm.StringParameter(this, 'cwagent-config-ssm-param', {
      parameterName: '/cwagent/linux/basic',
      stringValue: ssmParamValue,
      description: 'Cloudwatch Agent Configuration',
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

    cdk.Tags.of(sshOnlySG).add('Name', this.stackName + '-SG')

    // ec2 Role
    const ec2Role = new iam.Role(this, 'ec2-cw-agent-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
      ]
    })
    cdk.Tags.of(ec2Role).add('Name', this.stackName + '-iam-role')

    const userDataScript = readFileSync(
      './configs/userdata.sh',
      'utf8'
    ).replace('#!/bin/bash', '');

    const userData = ec2.UserData.forLinux();
    userData.addCommands(userDataScript);

    const ec2Instance = new ec2.Instance(this, 'memory-metric-ec2', {
      vpc: vpc,
      securityGroup: sshOnlySG,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      instanceType: new ec2.InstanceType('t3.micro'),
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
      propagateTagsToVolumeOnCreation: true,
      userData: userData
    });
    cdk.Tags.of(ec2Instance).add('Name', this.stackName + '-server')

    // override EC2 properties to parameterize AMI & AZs
    const cfnEC2 = ec2Instance.node.defaultChild as ec2.CfnInstance;
    cfnEC2.imageId = amiRegionMap.findInMap(cdk.Aws.REGION, 'HVM64');
    cfnEC2.availabilityZone = cdk.Fn.select(0, cdk.Fn.getAzs(cdk.Aws.REGION));

    ec2Instance.node.addDependency(cwAgentSSMParam);
  }
}

const app = new cdk.App();

new SampleEC2MemoryMetricStack(app, 'SampleEC2MemoryMetric', {
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION
  },
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false
  })
});

