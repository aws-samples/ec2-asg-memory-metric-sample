# EC2 and ASG with Memory metric

Memory metric is often needed to be monitor by many workloads however it is an OS-level metric and thus it is not readily available in EC2 Monitoring Dashboard. To view memory metric, we need to install [Cloudwatch agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html). Cloudwatch agent is useful to send both custom metrics and logs to Cloudwatch. For detailed explanation on how to install and configure Cloudwatch agent, please check this [documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Agent-on-EC2-Instance.html).

This repository contains sample EC2 and Autoscaling Group deployment with memory metric installed. The sample is available in both **AWS CDK** and **AWS Cloudformation** version. Both AWS CDK and Cloudformation offers versatile Infrastructure as a Code tool. AWS CDK enables you to use your own familiar programming language to develop the Infrastructure. There is a prerequisite to get started with AWS CDK. If you want to skip the prerequisites and immediately deploy the sample in your AWS account via Cloudformation console, you can use the Cloudformation template.

## Prerequisites

### Requirements to get started with AWS CDK:
1. [Installing AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2. [Installing Typescript](https://www.typescriptlang.org/download) : `npm install -g typescript`
3. [Installing AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install)
4. [Run CDK Bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)

### Requirements to get started with Cloudformation:
1. Deploy the Cloudformation YAML template in your Cloudformation console. [Creating Cloudformation Stack in AWS Console](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/GettingStarted.Walkthrough.html#GettingStarted.Walkthrough.createstack)

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

