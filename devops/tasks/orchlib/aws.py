'''
Tools to bring up an AWS nano instance, and to connect it to DNS via
Route 53. We do not want to be AWS-specific, and this file should be
the only place where we import boto.
'''

import time
import yaml

import boto3

import orchlib.config
import orchlib.fabric_flock

session = boto3.session.Session()
ec2 = session.resource('ec2')
ec2client = boto3.client('ec2')
r53 = boto3.client('route53')

UBUNTU_20_04 = "ami-09e67e426f25ce0d7"

def create_instance(name):
    '''
    Launch a machine on EC2. Return the boto instance object.
    '''
    blockDeviceMappings = [
        {
            "DeviceName": "/dev/xvda",
            "Ebs": {
                "DeleteOnTermination": True,
                "VolumeSize": 32,
                "VolumeType": "gp2"
            }
        }
    ]

    # This is kind of a mess.
    # Good command to help guide how to make this:
    # `aws ec2 describe-instances > template`
    # It doesn't correspond 1:1, but it's a good starting
    # point.
    response = ec2.create_instances(
        ImageId=UBUNTU_20_04,
        InstanceType='t2.nano',
        BlockDeviceMappings=blockDeviceMappings,
        KeyName=orchlib.config.creds['aws_keyname'],
        MinCount=1,
        MaxCount=1,
        Placement={
            "AvailabilityZone": "us-east-1b"
        },
        NetworkInterfaces=[
            {
                'SubnetId': orchlib.config.creds['aws_subnet_id'],
                'DeviceIndex': 0,
                'AssociatePublicIpAddress': True,
                'Groups': [orchlib.config.creds['aws_security_group']]
            }
        ],
        TagSpecifications=[
            {
                'ResourceType': 'instance',
                'Tags': [
                    {
                        'Key': 'Name',
                        'Value': name
                    },
                    {
                        'Key': 'Owner',
                        'Value': orchlib.config.creds['owner']
                    },
                    {
                        'Key': 'deploy-group',
                        'Value': 'learning-observer'
                    }
                ]
            }
        ]
    )

    instance = response[0]
    instance.wait_until_running()
    # Reload, to update with assigned IP, etc.
    instance = ec2.Instance(instance.instance_id)

    print("Launched ", instance.instance_id)
    print("IP: ", instance.public_ip_address)
    return instance


def list_instances():
    '''
    List all of the `learning-observer` instances, in a compact
    format, with just the:

    * Instance ID
    * Tags
    * Public IP Address
    '''
    reservations = ec2client.describe_instances(Filters=[
        {
            'Name': 'tag:deploy-group',
            'Values': ['learning-observer']
        },
    ])['Reservations']
    instances = sum([i['Instances'] for i in reservations], [])
    summary = [{
        'InstanceId': i['InstanceId'],
        'Tags': {tag['Key']: tag['Value'] for tag in i['Tags']},
        'PublicIpAddress': i.get('PublicIpAddress', "--.--.--.--")
    } for i in instances]
    return summary

def terminate_instances(name):
    '''
    Terminate all instances give the name.

    UNTESTED! DANGER. DANGER. DANGER. UNTESTED!

    Returns the number of instances terminated. We might kill more
    than one if we assign several the same name.

    Also, wipes their associated DNS.
    '''
    instances = list_instances()
    print("All instances: ", instances)
    matching_instances = [
        i for i in instances if i['Tags']['Name'] == name
    ]
    # Set to `None` so we don't accidentally touch this again!
    instances = None
    print("Matching instances: ", matching_instances)
    for i in range(10):
        print(10-i)
        time.sleep(1)
    print("Removing DNS")
    for instance in matching_instances:
        register_dns(
            name,
            'learning-observer.org',
            instance['PublicIpAddress'],
            unregister=True
        )
    print("Terminating")
    ec2client.terminate_instances(
        InstanceIds = [i['InstanceId'] for i in matching_instances]
    )
    
    return len(matching_instances)


def register_dns(subdomain, domain, ip, unregister=False):
    '''
    Assign a domain name to a machine.
    '''
    action = 'UPSERT'
    if unregister:
        action = 'DELETE'
    zones = r53.list_hosted_zones_by_name(
        DNSName=domain
    )['HostedZones']
    if len(zones)!= 1:
        raise Exception("Wrong number of hosted zones!")
    zoneId = zones[0]['Id']
    request = r53.change_resource_record_sets(
        HostedZoneId = zoneId,
        ChangeBatch = {
            'Changes': [
                {
                    'Action': action,
                    'ResourceRecordSet' : {
                        'Name' : '{subdomain}.{domain}.'.format(
                            subdomain=subdomain,
                            domain=domain
                        ),
                        'Type' : 'A',
                        'TTL' : 15,
                        'ResourceRecords' : [
                            {'Value': ip}
                        ]
                    }
                },
            ]
        }
    )

    # If we're setting DNS, wait for changes to propagate, so we
    # can use DNS later in the script
    while True and not unregister:
        print("Propagating DNS....", request['ChangeInfo']['Status'])
        time.sleep(1)
        id = request['ChangeInfo']['Id']
        request = r53.get_change(Id=id)
        if request['ChangeInfo']['Status'] == 'INSYNC':
            break
    return True


def name_to_group(machine_name):
    '''
    For a machine name, return a fabric ssh group of machines with
    that name.
    '''
    pool = " ".join([
        i['PublicIpAddress']
        for i in list_instances()
        if i['Tags']['Name'] == machine_name
    ])
    print(pool)
    group = orchlib.fabric_flock.group_from_poolstring(pool)
    return group
