#!/usr/bin/env bash

# Note:
# This script generates AMI mapping in YAML and convert it to JSON format
# This script requires AWS CLI and yq installed

generateAMIMappingYAML() {
    echo "Mappings:"
    echo "  RegionMap:"
    amiNameFilter="ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-"
    regions=$(aws ec2 describe-regions --output text --query 'Regions[*].RegionName')
    for region in $regions; do
        (
            echo "    $region:"
            AMI=$(aws ec2 describe-images --region $region --filters Name=owner-alias,Values="amazon" Name=name,Values="$amiNameFilter*" Name=architecture,Values=x86_64 | jq -r '.Images |= sort_by(.CreationDate) | .Images | reverse | .[0].ImageId')
            echo "      HVM64: $AMI"
        )
    done
}

generateAMIMappingYAML | yq -o json > ami-mapping.json
