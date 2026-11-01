import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/lib/cli.ts
import { isAbsolute as isAbsolute4, resolve as resolve5 } from "node:path";

// ../../../packages/context-contract/src/node.ts
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
function readTextBounded(path, maxBytes) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    return error.code === "ENOENT" ? { kind: "missing" } : { kind: "unreadable" };
  }
  try {
    if (!fstatSync(fd).isFile()) return { kind: "unreadable" };
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const read = readSync(fd, buffer, total, buffer.length - total, null);
      if (read === 0) break;
      total += read;
    }
    return total > maxBytes ? { kind: "too-large" } : { kind: "ok", text: buffer.toString("utf8", 0, total) };
  } catch {
    return { kind: "unreadable" };
  } finally {
    closeSync(fd);
  }
}

// ../../../packages/template-analysis/src/data/replacement.json
var replacement_default = {
  note: "createOnly lists properties the CloudFormation resource provider schema marks createOnlyProperties: changing one replaces the resource. Conditional or nested cases are not captured.",
  retrieved: "2026-10-31",
  source: "https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip",
  supplement: {
    note: "Properties whose change CloudFormation documents as constrained in prose rather than as a replacement rule. The analyzer reports possible replacement or a failed update, never a certain replacement; a change set confirms.",
    source: "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb-table.html",
    types: {
      "AWS::DynamoDB::Table": [
        "KeySchema",
        "AttributeDefinitions",
        "LocalSecondaryIndexes",
        "GlobalSecondaryIndexes"
      ]
    }
  },
  types: {
    "AWS::ApiGateway::Account": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::ApiKey": {
      createOnly: ["GenerateDistinctId", "Name", "Value"],
      primaryIdentifier: ["APIKeyId"]
    },
    "AWS::ApiGateway::Authorizer": {
      createOnly: ["RestApiId"],
      primaryIdentifier: ["RestApiId", "AuthorizerId"]
    },
    "AWS::ApiGateway::BasePathMapping": {
      createOnly: ["BasePath", "DomainName"],
      primaryIdentifier: ["DomainName", "BasePath"]
    },
    "AWS::ApiGateway::BasePathMappingV2": {
      createOnly: ["BasePath", "DomainNameArn"],
      primaryIdentifier: ["BasePathMappingArn"]
    },
    "AWS::ApiGateway::ClientCertificate": {
      createOnly: [],
      primaryIdentifier: ["ClientCertificateId"]
    },
    "AWS::ApiGateway::Deployment": {
      createOnly: ["DeploymentCanarySettings", "RestApiId"],
      primaryIdentifier: ["DeploymentId", "RestApiId"]
    },
    "AWS::ApiGateway::DocumentationPart": {
      createOnly: ["Location", "RestApiId"],
      primaryIdentifier: ["DocumentationPartId", "RestApiId"]
    },
    "AWS::ApiGateway::DocumentationVersion": {
      createOnly: ["DocumentationVersion", "RestApiId"],
      primaryIdentifier: ["DocumentationVersion", "RestApiId"]
    },
    "AWS::ApiGateway::DomainName": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::ApiGateway::DomainNameAccessAssociation": {
      createOnly: [
        "AccessAssociationSource",
        "AccessAssociationSourceType",
        "DomainNameArn",
        "Tags"
      ],
      primaryIdentifier: ["DomainNameAccessAssociationArn"]
    },
    "AWS::ApiGateway::DomainNameV2": {
      createOnly: ["DomainName", "EndpointConfiguration", "SecurityPolicy"],
      primaryIdentifier: ["DomainNameArn"]
    },
    "AWS::ApiGateway::GatewayResponse": {
      createOnly: ["ResponseType", "RestApiId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::Method": {
      createOnly: ["HttpMethod", "ResourceId", "RestApiId"],
      primaryIdentifier: ["RestApiId", "ResourceId", "HttpMethod"]
    },
    "AWS::ApiGateway::Model": {
      createOnly: ["ContentType", "Name", "RestApiId"],
      primaryIdentifier: ["RestApiId", "Name"]
    },
    "AWS::ApiGateway::RequestValidator": {
      createOnly: ["Name", "RestApiId"],
      primaryIdentifier: ["RestApiId", "RequestValidatorId"]
    },
    "AWS::ApiGateway::Resource": {
      createOnly: ["ParentId", "PathPart", "RestApiId"],
      primaryIdentifier: ["RestApiId", "ResourceId"]
    },
    "AWS::ApiGateway::RestApi": {
      createOnly: [],
      primaryIdentifier: ["RestApiId"]
    },
    "AWS::ApiGateway::Stage": {
      createOnly: ["RestApiId", "StageName"],
      primaryIdentifier: ["RestApiId", "StageName"]
    },
    "AWS::ApiGateway::UsagePlan": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::UsagePlanKey": {
      createOnly: ["KeyId", "KeyType", "UsagePlanId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::VpcLink": {
      createOnly: ["TargetArns"],
      primaryIdentifier: ["VpcLinkId"]
    },
    "AWS::ApiGatewayV2::Api": {
      createOnly: ["ProtocolType"],
      primaryIdentifier: ["ApiId"]
    },
    "AWS::ApiGatewayV2::ApiGatewayManagedOverrides": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId"]
    },
    "AWS::ApiGatewayV2::ApiMapping": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["ApiMappingId", "DomainName"]
    },
    "AWS::ApiGatewayV2::Authorizer": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["AuthorizerId", "ApiId"]
    },
    "AWS::ApiGatewayV2::Deployment": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "DeploymentId"]
    },
    "AWS::ApiGatewayV2::DomainName": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::ApiGatewayV2::Integration": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "IntegrationId"]
    },
    "AWS::ApiGatewayV2::IntegrationResponse": {
      createOnly: ["ApiId", "IntegrationId"],
      primaryIdentifier: ["ApiId", "IntegrationId", "IntegrationResponseId"]
    },
    "AWS::ApiGatewayV2::Model": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "ModelId"]
    },
    "AWS::ApiGatewayV2::PortalProduct": {
      createOnly: [],
      primaryIdentifier: ["PortalProductArn"]
    },
    "AWS::ApiGatewayV2::Route": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "RouteId"]
    },
    "AWS::ApiGatewayV2::RouteResponse": {
      createOnly: ["ApiId", "RouteId"],
      primaryIdentifier: ["ApiId", "RouteId", "RouteResponseId"]
    },
    "AWS::ApiGatewayV2::RoutingRule": {
      createOnly: ["DomainNameArn"],
      primaryIdentifier: ["RoutingRuleArn"]
    },
    "AWS::ApiGatewayV2::Stage": {
      createOnly: ["ApiId", "StageName"],
      primaryIdentifier: ["ApiId", "StageName"]
    },
    "AWS::ApiGatewayV2::VpcLink": {
      createOnly: ["SecurityGroupIds", "SubnetIds"],
      primaryIdentifier: ["VpcLinkId"]
    },
    "AWS::AppSync::Api": {
      createOnly: [],
      primaryIdentifier: ["ApiArn"]
    },
    "AWS::AppSync::ApiCache": {
      createOnly: ["ApiId", "AtRestEncryptionEnabled", "TransitEncryptionEnabled"],
      primaryIdentifier: ["Id"]
    },
    "AWS::AppSync::ApiKey": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "ApiKeyId"]
    },
    "AWS::AppSync::ChannelNamespace": {
      createOnly: ["ApiId", "Name"],
      primaryIdentifier: ["ChannelNamespaceArn"]
    },
    "AWS::AppSync::DataSource": {
      createOnly: ["ApiId", "Name"],
      primaryIdentifier: ["DataSourceArn"]
    },
    "AWS::AppSync::DomainName": {
      createOnly: ["CertificateArn", "DomainName"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::AppSync::DomainNameApiAssociation": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["ApiAssociationIdentifier"]
    },
    "AWS::AppSync::FunctionConfiguration": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::AppSync::GraphQLApi": {
      createOnly: [],
      primaryIdentifier: ["Arn"]
    },
    "AWS::AppSync::GraphQLSchema": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::AppSync::Resolver": {
      createOnly: ["ApiId", "FieldName", "TypeName"],
      primaryIdentifier: ["ResolverArn"]
    },
    "AWS::AppSync::SourceApiAssociation": {
      createOnly: ["MergedApiIdentifier", "SourceApiIdentifier"],
      primaryIdentifier: ["AssociationArn"]
    },
    "AWS::AppSync::Type": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Athena::CapacityReservation": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Athena::DataCatalog": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Athena::NamedQuery": {
      createOnly: ["Database", "Description", "Name", "QueryString", "WorkGroup"],
      primaryIdentifier: ["NamedQueryId"]
    },
    "AWS::Athena::PreparedStatement": {
      createOnly: ["StatementName", "WorkGroup"],
      primaryIdentifier: ["StatementName", "WorkGroup"]
    },
    "AWS::Athena::WorkGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Backup::BackupAccessPoint": {
      createOnly: ["AccessPointInTime", "AccessPointPolicy", "Name", "RecoveryPointArn"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Backup::BackupPlan": {
      createOnly: [],
      primaryIdentifier: ["BackupPlanId"]
    },
    "AWS::Backup::BackupSelection": {
      createOnly: ["BackupPlanId", "BackupSelection"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Backup::BackupVault": {
      createOnly: ["BackupVaultName", "EncryptionKeyArn"],
      primaryIdentifier: ["BackupVaultName"]
    },
    "AWS::Backup::Framework": {
      createOnly: ["FrameworkName"],
      primaryIdentifier: ["FrameworkArn"]
    },
    "AWS::Backup::LegalHold": {
      createOnly: ["Description", "RecoveryPointSelection", "Title"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Backup::LogicallyAirGappedBackupVault": {
      createOnly: ["BackupVaultName", "EncryptionKeyArn", "MaxRetentionDays", "MinRetentionDays"],
      primaryIdentifier: ["BackupVaultName"]
    },
    "AWS::Backup::ReportPlan": {
      createOnly: ["ReportPlanName"],
      primaryIdentifier: ["ReportPlanArn"]
    },
    "AWS::Backup::RestoreTestingPlan": {
      createOnly: ["RestoreTestingPlanName"],
      primaryIdentifier: ["RestoreTestingPlanName"]
    },
    "AWS::Backup::RestoreTestingSelection": {
      createOnly: [
        "ProtectedResourceType",
        "RestoreTestingPlanName",
        "RestoreTestingSelectionName"
      ],
      primaryIdentifier: ["RestoreTestingPlanName", "RestoreTestingSelectionName"]
    },
    "AWS::Backup::TieringConfiguration": {
      createOnly: ["TieringConfigurationName"],
      primaryIdentifier: ["TieringConfigurationName"]
    },
    "AWS::CertificateManager::Account": {
      createOnly: [],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::CertificateManager::AcmeDomainValidation": {
      createOnly: [
        "AcmeEndpointArn",
        "DomainName",
        "PrevalidationOptions/DnsPrevalidation/HostedZoneId"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CertificateManager::AcmeEndpoint": {
      createOnly: ["AuthorizationBehavior", "CertificateTags"],
      primaryIdentifier: ["AcmeEndpointArn"]
    },
    "AWS::CertificateManager::AcmeExternalAccountBinding": {
      createOnly: ["AcmeEndpointArn", "Expiration", "RoleArn"],
      primaryIdentifier: ["AcmeExternalAccountBindingArn"]
    },
    "AWS::CertificateManager::Certificate": {
      createOnly: [
        "CertificateAuthorityArn",
        "CertificateExport",
        "DomainName",
        "DomainValidationOptions",
        "KeyAlgorithm",
        "SubjectAlternativeNames"
      ],
      primaryIdentifier: ["CertificateArn"]
    },
    "AWS::CloudFront::AnycastIpList": {
      createOnly: ["IpCount", "Name", "Tags"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::CachePolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::CloudFrontOriginAccessIdentity": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::ConnectionFunction": {
      createOnly: ["ConnectionFunctionConfig/Runtime", "Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::ConnectionGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::ContinuousDeploymentPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::Distribution": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::DistributionTenant": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::FieldLevelEncryptionConfig": {
      createOnly: ["CallerReference"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudFront::FieldLevelEncryptionProfile": {
      createOnly: ["FieldLevelEncryptionProfileConfig/CallerReference"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudFront::Function": {
      createOnly: ["Name"],
      primaryIdentifier: ["FunctionARN"]
    },
    "AWS::CloudFront::KeyGroup": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::KeyValueStore": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::CloudFront::MonitoringSubscription": {
      createOnly: ["DistributionId"],
      primaryIdentifier: ["DistributionId"]
    },
    "AWS::CloudFront::OriginAccessControl": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::OriginRequestPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::PublicKey": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::RealtimeLogConfig": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudFront::ResponseHeadersPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::StreamingDistribution": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::TrustStore": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::VpcOrigin": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudWatch::AccessGrant": {
      createOnly: [
        "DomainId",
        "Name",
        "Permission",
        "Principal",
        "ScopedActions",
        "SpaceId",
        "Tags"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::AccessProfile": {
      createOnly: ["SpaceId"],
      primaryIdentifier: ["SpaceId", "ProfileId"]
    },
    "AWS::CloudWatch::Alarm": {
      createOnly: ["AlarmName"],
      primaryIdentifier: ["AlarmName"]
    },
    "AWS::CloudWatch::AlarmMuteRule": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::AnomalyDetector": {
      createOnly: [
        "Dimensions",
        "MetricCharacteristics",
        "MetricMathAnomalyDetector",
        "MetricName",
        "Namespace",
        "SingleMetricAnomalyDetector",
        "Stat"
      ],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudWatch::CompositeAlarm": {
      createOnly: ["AlarmName"],
      primaryIdentifier: ["AlarmName"]
    },
    "AWS::CloudWatch::Dashboard": {
      createOnly: ["DashboardName"],
      primaryIdentifier: ["DashboardName"]
    },
    "AWS::CloudWatch::Domain": {
      createOnly: [],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::DomainAccessGrantForOrganization": {
      createOnly: ["DomainId", "Name", "Permission", "Principal", "Tags"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::DomainForOrganization": {
      createOnly: ["DomainAccessRoleArn"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::InsightRule": {
      createOnly: ["RuleName"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::Integration": {
      createOnly: ["IntegrationType", "Name"],
      primaryIdentifier: ["IntegrationArn"]
    },
    "AWS::CloudWatch::LogAlarm": {
      createOnly: ["AlarmName"],
      primaryIdentifier: ["AlarmName"]
    },
    "AWS::CloudWatch::MetricStream": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::CloudWatch::OTelEnrichment": {
      createOnly: [],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::CloudWatch::OmniDashboard": {
      createOnly: ["SpaceId"],
      primaryIdentifier: ["SpaceId", "DashboardId"]
    },
    "AWS::CloudWatch::ResourceMetricsConfiguration": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::CloudWatch::Space": {
      createOnly: ["AgentCoreEvaluationRoleArn", "DataAccessRoleArn", "DomainId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::View": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::CodeDeploy::Application": {
      createOnly: ["ApplicationName", "ComputePlatform"],
      primaryIdentifier: ["ApplicationName"]
    },
    "AWS::CodeDeploy::DeploymentConfig": {
      createOnly: [
        "ComputePlatform",
        "DeploymentConfigName",
        "MinimumHealthyHosts",
        "TrafficRoutingConfig",
        "ZonalConfig"
      ],
      primaryIdentifier: ["DeploymentConfigName"]
    },
    "AWS::CodeDeploy::DeploymentGroup": {
      createOnly: ["ApplicationName", "DeploymentGroupName"],
      primaryIdentifier: ["ApplicationName", "DeploymentGroupName"]
    },
    "AWS::Cognito::IdentityPool": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::Cognito::IdentityPoolPrincipalTag": {
      createOnly: ["IdentityPoolId", "IdentityProviderName"],
      primaryIdentifier: ["IdentityPoolId", "IdentityProviderName"]
    },
    "AWS::Cognito::IdentityPoolRoleAttachment": {
      createOnly: ["IdentityPoolId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Cognito::LogDeliveryConfiguration": {
      createOnly: ["UserPoolId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Cognito::ManagedLoginBranding": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ManagedLoginBrandingId"]
    },
    "AWS::Cognito::Terms": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "TermsId"]
    },
    "AWS::Cognito::UserPool": {
      createOnly: [],
      primaryIdentifier: ["UserPoolId"]
    },
    "AWS::Cognito::UserPoolClient": {
      createOnly: ["GenerateSecret", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ClientId"]
    },
    "AWS::Cognito::UserPoolDomain": {
      createOnly: ["Domain", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "Domain"]
    },
    "AWS::Cognito::UserPoolGroup": {
      createOnly: ["GroupName", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "GroupName"]
    },
    "AWS::Cognito::UserPoolIdentityProvider": {
      createOnly: ["ProviderName", "ProviderType", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ProviderName"]
    },
    "AWS::Cognito::UserPoolRegionalConfigurationAttachment": {
      createOnly: ["UserPoolId"],
      primaryIdentifier: ["UserPoolId"]
    },
    "AWS::Cognito::UserPoolReplica": {
      createOnly: ["RegionName", "UserPoolId", "UserPoolTagsAtCreate"],
      primaryIdentifier: ["UserPoolId", "RegionName"]
    },
    "AWS::Cognito::UserPoolResourceServer": {
      createOnly: ["Identifier", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "Identifier"]
    },
    "AWS::Cognito::UserPoolRiskConfigurationAttachment": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ClientId"]
    },
    "AWS::Cognito::UserPoolUICustomizationAttachment": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ClientId"]
    },
    "AWS::Cognito::UserPoolUser": {
      createOnly: [
        "ClientMetadata",
        "DesiredDeliveryMediums",
        "ForceAliasCreation",
        "MessageAction",
        "UserAttributes",
        "UserPoolId",
        "Username",
        "ValidationData"
      ],
      primaryIdentifier: ["UserPoolId", "Username"]
    },
    "AWS::Cognito::UserPoolUserToGroupAttachment": {
      createOnly: ["GroupName", "UserPoolId", "Username"],
      primaryIdentifier: ["UserPoolId", "GroupName", "Username"]
    },
    "AWS::DynamoDB::GlobalTable": {
      createOnly: ["TableName"],
      primaryIdentifier: ["TableName"]
    },
    "AWS::DynamoDB::Table": {
      createOnly: ["ImportSourceSpecification", "TableName"],
      primaryIdentifier: ["TableName"]
    },
    "AWS::ECR::PublicRepository": {
      createOnly: ["RepositoryName"],
      primaryIdentifier: ["RepositoryName"]
    },
    "AWS::ECR::PullThroughCacheRule": {
      createOnly: [
        "CredentialArn",
        "CustomRoleArn",
        "EcrRepositoryPrefix",
        "UpstreamRegistry",
        "UpstreamRegistryUrl",
        "UpstreamRepositoryPrefix"
      ],
      primaryIdentifier: ["EcrRepositoryPrefix"]
    },
    "AWS::ECR::PullTimeUpdateExclusion": {
      createOnly: ["PrincipalArn"],
      primaryIdentifier: ["PrincipalArn"]
    },
    "AWS::ECR::RegistryPolicy": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::ECR::RegistryScanningConfiguration": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::ECR::ReplicationConfiguration": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::ECR::Repository": {
      createOnly: [
        "EncryptionConfiguration",
        "EncryptionConfiguration/EncryptionType",
        "EncryptionConfiguration/KmsKey",
        "RepositoryName"
      ],
      primaryIdentifier: ["RepositoryName"]
    },
    "AWS::ECR::RepositoryCreationTemplate": {
      createOnly: ["Prefix"],
      primaryIdentifier: ["Prefix"]
    },
    "AWS::ECR::SigningConfiguration": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::EFS::AccessPoint": {
      createOnly: [
        "ClientToken",
        "CreationInfo",
        "CreationInfo/OwnerGid",
        "CreationInfo/OwnerUid",
        "CreationInfo/Permissions",
        "FileSystemId",
        "PosixUser",
        "PosixUser/Gid",
        "PosixUser/SecondaryGids",
        "PosixUser/Uid",
        "RootDirectory",
        "RootDirectory/CreationInfo",
        "RootDirectory/Path"
      ],
      primaryIdentifier: ["AccessPointId"]
    },
    "AWS::EFS::FileSystem": {
      createOnly: ["AvailabilityZoneName", "Encrypted", "KmsKeyId", "PerformanceMode"],
      primaryIdentifier: ["FileSystemId"]
    },
    "AWS::EFS::MountTarget": {
      createOnly: ["FileSystemId", "IpAddress", "IpAddressType", "Ipv6Address", "SubnetId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Events::ApiDestination": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::Archive": {
      createOnly: ["ArchiveName", "SourceArn"],
      primaryIdentifier: ["ArchiveName"]
    },
    "AWS::Events::Connection": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::Endpoint": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::EventBus": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::EventBusPolicy": {
      createOnly: ["EventBusName", "StatementId"],
      primaryIdentifier: ["EventBusName", "StatementId"]
    },
    "AWS::Events::Rule": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Blueprint": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Catalog": {
      createOnly: ["Name"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::Glue::Classifier": {
      createOnly: [
        "CsvClassifier/Name",
        "GrokClassifier/Name",
        "JsonClassifier/Name",
        "XMLClassifier/Name"
      ],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::Connection": {
      createOnly: ["CatalogId", "ConnectionInput/Name"],
      primaryIdentifier: ["CatalogId", "Name"]
    },
    "AWS::Glue::ConnectionType": {
      createOnly: [
        "ConnectionProperties",
        "ConnectionType",
        "ConnectorAuthenticationConfiguration",
        "Description",
        "IntegrationType",
        "RestConfiguration"
      ],
      primaryIdentifier: ["ConnectionTypeArn"]
    },
    "AWS::Glue::Crawler": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::CustomEntityType": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::DataCatalogEncryptionSettings": {
      createOnly: ["CatalogId"],
      primaryIdentifier: ["CatalogId"]
    },
    "AWS::Glue::DataQualityRuleset": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::Database": {
      createOnly: ["DatabaseName"],
      primaryIdentifier: ["DatabaseName"]
    },
    "AWS::Glue::DevEndpoint": {
      createOnly: ["EndpointName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Glue::IdentityCenterConfiguration": {
      createOnly: ["InstanceArn"],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::Glue::Integration": {
      createOnly: [
        "AdditionalEncryptionContext",
        "IntegrationConfig",
        "IntegrationConfig/RefreshInterval",
        "IntegrationName",
        "KmsKeyId",
        "SourceArn",
        "TargetArn"
      ],
      primaryIdentifier: ["IntegrationArn", "IntegrationName"]
    },
    "AWS::Glue::IntegrationResourceProperty": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn", "ResourcePropertyArn"]
    },
    "AWS::Glue::Job": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::MLTransform": {
      createOnly: [
        "InputRecordTables",
        "TransformEncryption",
        "TransformParameters/FindMatchesParameters/PrimaryKeyColumnName"
      ],
      primaryIdentifier: ["TransformId"]
    },
    "AWS::Glue::Partition": {
      createOnly: ["CatalogId", "DatabaseName", "PartitionInput/Values", "TableName"],
      primaryIdentifier: [
        "CatalogId",
        "DatabaseName",
        "TableName",
        "IdentifierPartitionInputValues"
      ]
    },
    "AWS::Glue::Registry": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Schema": {
      createOnly: ["DataFormat", "Name", "Registry", "SchemaDefinition"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::SchemaVersion": {
      createOnly: ["Schema", "SchemaDefinition"],
      primaryIdentifier: ["VersionId"]
    },
    "AWS::Glue::SchemaVersionMetadata": {
      createOnly: ["Key", "SchemaVersionId", "Value"],
      primaryIdentifier: ["SchemaVersionId", "Key", "Value"]
    },
    "AWS::Glue::SecurityConfiguration": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::Session": {
      createOnly: [
        "Command",
        "Connections",
        "DefaultArguments",
        "Description",
        "GlueVersion",
        "Id",
        "IdleTimeout",
        "MaxCapacity",
        "NumberOfWorkers",
        "RequestOrigin",
        "Role",
        "SecurityConfiguration",
        "Timeout",
        "WorkerType"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Table": {
      createOnly: ["CatalogId", "DatabaseName", "Name", "TableInput/Name"],
      primaryIdentifier: ["CatalogId", "DatabaseName", "Name"]
    },
    "AWS::Glue::TableOptimizer": {
      createOnly: ["CatalogId", "DatabaseName", "TableName", "Type"],
      primaryIdentifier: ["TableName", "DatabaseName", "Type", "CatalogId"]
    },
    "AWS::Glue::Trigger": {
      createOnly: ["Name", "Type", "WorkflowName"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::UsageProfile": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::UserDefinedFunction": {
      createOnly: ["DatabaseName", "FunctionName", "FunctionType"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Workflow": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::IAM::AccessKey": {
      createOnly: ["Serial", "UserName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::IAM::Group": {
      createOnly: ["GroupName"],
      primaryIdentifier: ["GroupName"]
    },
    "AWS::IAM::GroupPolicy": {
      createOnly: ["GroupName", "PolicyName"],
      primaryIdentifier: ["PolicyName", "GroupName"]
    },
    "AWS::IAM::InstanceProfile": {
      createOnly: ["InstanceProfileName", "Path"],
      primaryIdentifier: ["InstanceProfileName"]
    },
    "AWS::IAM::ManagedPolicy": {
      createOnly: ["Description", "ManagedPolicyName", "Path"],
      primaryIdentifier: ["PolicyArn"]
    },
    "AWS::IAM::OIDCProvider": {
      createOnly: ["Url"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::IAM::Policy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::IAM::Role": {
      createOnly: ["Path", "RoleName"],
      primaryIdentifier: ["RoleName"]
    },
    "AWS::IAM::RolePolicy": {
      createOnly: ["PolicyName", "RoleName"],
      primaryIdentifier: ["PolicyName", "RoleName"]
    },
    "AWS::IAM::SAMLProvider": {
      createOnly: ["AddPrivateKey", "Name", "RemovePrivateKey"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::IAM::ServerCertificate": {
      createOnly: ["CertificateBody", "CertificateChain", "PrivateKey", "ServerCertificateName"],
      primaryIdentifier: ["ServerCertificateName"]
    },
    "AWS::IAM::ServiceLinkedRole": {
      createOnly: ["AWSServiceName", "CustomSuffix"],
      primaryIdentifier: ["RoleName"]
    },
    "AWS::IAM::User": {
      createOnly: ["UserName"],
      primaryIdentifier: ["UserName"]
    },
    "AWS::IAM::UserPolicy": {
      createOnly: ["PolicyName", "UserName"],
      primaryIdentifier: ["PolicyName", "UserName"]
    },
    "AWS::IAM::UserToGroupAddition": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::IAM::VirtualMFADevice": {
      createOnly: ["Base32StringSeed", "Path", "VirtualMfaDeviceName"],
      primaryIdentifier: ["SerialNumber"]
    },
    "AWS::KMS::Alias": {
      createOnly: ["AliasName"],
      primaryIdentifier: ["AliasName"]
    },
    "AWS::KMS::Key": {
      createOnly: [],
      primaryIdentifier: ["KeyId"]
    },
    "AWS::KMS::ReplicaKey": {
      createOnly: ["PrimaryKeyArn"],
      primaryIdentifier: ["KeyId"]
    },
    "AWS::Kinesis::Channel": {
      createOnly: [
        "ChannelName",
        "EncryptionConfiguration",
        "S3DestinationConfiguration/DeadLetterQueueS3Configuration",
        "S3DestinationConfiguration/StorageConfiguration",
        "S3TablesDestinationConfiguration/DeadLetterQueueS3Configuration",
        "S3TablesDestinationConfiguration/S3TablesConfigurationList",
        "ServiceExecutionRoleARN",
        "StreamConfigurationList"
      ],
      primaryIdentifier: ["ChannelARN"]
    },
    "AWS::Kinesis::ResourcePolicy": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::Kinesis::Stream": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Kinesis::StreamConsumer": {
      createOnly: ["ConsumerName", "StreamARN", "Tags"],
      primaryIdentifier: ["ConsumerARN"]
    },
    "AWS::KinesisFirehose::DeliveryStream": {
      createOnly: [
        "AmazonOpenSearchServerlessDestinationConfiguration/VpcConfiguration",
        "AmazonopensearchserviceDestinationConfiguration/VpcConfiguration",
        "DatabaseSourceConfiguration",
        "DeliveryStreamName",
        "DeliveryStreamType",
        "DirectPutSourceConfiguration",
        "ElasticsearchDestinationConfiguration/VpcConfiguration",
        "IcebergDestinationConfiguration/CatalogConfiguration",
        "KinesisStreamSourceConfiguration",
        "MSKSourceConfiguration",
        "SnowflakeDestinationConfiguration/SnowflakeVpcConfiguration"
      ],
      primaryIdentifier: ["DeliveryStreamName"]
    },
    "AWS::Lambda::Alias": {
      createOnly: ["FunctionName", "Name"],
      primaryIdentifier: ["AliasArn"]
    },
    "AWS::Lambda::CapacityProvider": {
      createOnly: [
        "CapacityProviderName",
        "InstanceRequirements",
        "KmsKeyArn",
        "PermissionsConfig",
        "VpcConfig"
      ],
      primaryIdentifier: ["CapacityProviderName"]
    },
    "AWS::Lambda::CodeSigningConfig": {
      createOnly: [],
      primaryIdentifier: ["CodeSigningConfigArn"]
    },
    "AWS::Lambda::EventInvokeConfig": {
      createOnly: ["FunctionName", "Qualifier"],
      primaryIdentifier: ["FunctionName", "Qualifier"]
    },
    "AWS::Lambda::EventSourceMapping": {
      createOnly: [
        "EventSourceArn",
        "SelfManagedEventSource",
        "StartingPosition",
        "StartingPositionTimestamp"
      ],
      primaryIdentifier: ["Id"]
    },
    "AWS::Lambda::Function": {
      createOnly: ["FunctionName", "PackageType", "TenancyConfig"],
      primaryIdentifier: ["FunctionName"]
    },
    "AWS::Lambda::LayerVersion": {
      createOnly: [
        "CompatibleArchitectures",
        "CompatibleRuntimes",
        "Content",
        "Description",
        "LayerName",
        "LicenseInfo"
      ],
      primaryIdentifier: ["LayerVersionArn"]
    },
    "AWS::Lambda::LayerVersionPermission": {
      createOnly: ["Action", "LayerVersionArn", "OrganizationId", "Principal"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Lambda::MicrovmImage": {
      createOnly: ["Name"],
      primaryIdentifier: ["ImageArn"]
    },
    "AWS::Lambda::NetworkConnector": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Lambda::Permission": {
      createOnly: [
        "Action",
        "EventSourceToken",
        "FunctionName",
        "FunctionUrlAuthType",
        "InvokedViaFunctionUrl",
        "Principal",
        "PrincipalOrgID",
        "SourceAccount",
        "SourceArn"
      ],
      primaryIdentifier: ["FunctionName", "Id"]
    },
    "AWS::Lambda::ResourcePolicy": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::Lambda::Url": {
      createOnly: ["Qualifier", "TargetFunctionArn"],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::Lambda::Version": {
      createOnly: [
        "CodeSha256",
        "Description",
        "FunctionName",
        "ProvisionedConcurrencyConfig",
        "RuntimePolicy"
      ],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::Lambda::WebFunction": {
      createOnly: ["FunctionName"],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::Lambda::WebFunctionEndpoint": {
      createOnly: ["EndpointName", "EndpointType", "FunctionName", "Regions"],
      primaryIdentifier: ["EndpointArn"]
    },
    "AWS::Lambda::WebFunctionRevision": {
      createOnly: ["BuildConfig", "Description", "FunctionName", "KmsKeyArn", "ServiceConfig"],
      primaryIdentifier: ["RevisionArn"]
    },
    "AWS::Logs::AccountPolicy": {
      createOnly: ["PolicyName", "PolicyType"],
      primaryIdentifier: ["AccountId", "PolicyType", "PolicyName"]
    },
    "AWS::Logs::Delivery": {
      createOnly: ["DeliveryDestinationArn", "DeliverySourceName"],
      primaryIdentifier: ["DeliveryId"]
    },
    "AWS::Logs::DeliveryDestination": {
      createOnly: ["DeliveryDestinationType", "DestinationResourceArn", "Name", "OutputFormat"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Logs::DeliverySource": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Logs::Destination": {
      createOnly: ["DestinationName"],
      primaryIdentifier: ["DestinationName"]
    },
    "AWS::Logs::Integration": {
      createOnly: ["IntegrationName", "IntegrationType", "ResourceConfig"],
      primaryIdentifier: ["IntegrationName"]
    },
    "AWS::Logs::LogAnomalyDetector": {
      createOnly: [],
      primaryIdentifier: ["AnomalyDetectorArn"]
    },
    "AWS::Logs::LogGroup": {
      createOnly: ["LogGroupName"],
      primaryIdentifier: ["LogGroupName"]
    },
    "AWS::Logs::LogStream": {
      createOnly: ["LogGroupName", "LogStreamName"],
      primaryIdentifier: ["LogGroupName", "LogStreamName"]
    },
    "AWS::Logs::MetricFilter": {
      createOnly: ["FilterName", "LogGroupName"],
      primaryIdentifier: ["LogGroupName", "FilterName"]
    },
    "AWS::Logs::QueryDefinition": {
      createOnly: [],
      primaryIdentifier: ["QueryDefinitionId"]
    },
    "AWS::Logs::ResourcePolicy": {
      createOnly: ["PolicyName"],
      primaryIdentifier: ["PolicyName"]
    },
    "AWS::Logs::ScheduledQuery": {
      createOnly: ["Name"],
      primaryIdentifier: ["ScheduledQueryArn"]
    },
    "AWS::Logs::StorageTierPolicy": {
      createOnly: [],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::Logs::SubscriptionFilter": {
      createOnly: ["FilterName", "LogGroupName"],
      primaryIdentifier: ["FilterName", "LogGroupName"]
    },
    "AWS::Logs::Transformer": {
      createOnly: ["LogGroupIdentifier"],
      primaryIdentifier: ["LogGroupIdentifier"]
    },
    "AWS::OpenSearchService::Application": {
      createOnly: ["KmsKeyArn", "Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::OpenSearchService::Domain": {
      createOnly: ["DomainName", "EngineMode"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::Pipes::Pipe": {
      createOnly: [
        "Name",
        "Source",
        "SourceParameters/ActiveMQBrokerParameters/QueueName",
        "SourceParameters/DynamoDBStreamParameters/StartingPosition",
        "SourceParameters/KinesisStreamParameters/StartingPosition",
        "SourceParameters/KinesisStreamParameters/StartingPositionTimestamp",
        "SourceParameters/ManagedStreamingKafkaParameters/ConsumerGroupID",
        "SourceParameters/ManagedStreamingKafkaParameters/StartingPosition",
        "SourceParameters/ManagedStreamingKafkaParameters/TopicName",
        "SourceParameters/RabbitMQBrokerParameters/QueueName",
        "SourceParameters/RabbitMQBrokerParameters/VirtualHost",
        "SourceParameters/SelfManagedKafkaParameters/AdditionalBootstrapServers",
        "SourceParameters/SelfManagedKafkaParameters/ConsumerGroupID",
        "SourceParameters/SelfManagedKafkaParameters/StartingPosition",
        "SourceParameters/SelfManagedKafkaParameters/TopicName"
      ],
      primaryIdentifier: ["Name"]
    },
    "AWS::RDS::ClusterSnapshot": {
      createOnly: ["DBClusterIdentifier", "DBClusterSnapshotIdentifier"],
      primaryIdentifier: ["DBClusterSnapshotArn"]
    },
    "AWS::RDS::CustomDBEngineVersion": {
      createOnly: [
        "DatabaseInstallationFiles",
        "DatabaseInstallationFilesS3BucketName",
        "DatabaseInstallationFilesS3Prefix",
        "Engine",
        "EngineVersion",
        "ImageId",
        "KMSKeyId",
        "Manifest",
        "SourceCustomDbEngineVersionIdentifier",
        "UseAwsProvidedLatestImage"
      ],
      primaryIdentifier: ["Engine", "EngineVersion"]
    },
    "AWS::RDS::DBCluster": {
      createOnly: [
        "ClusterScalabilityType",
        "DBClusterIdentifier",
        "DBSubnetGroupName",
        "DBSystemId",
        "DatabaseName",
        "EngineMode",
        "KmsKeyId",
        "PubliclyAccessible",
        "RestoreToTime",
        "RestoreType",
        "SnapshotIdentifier",
        "SourceDBClusterIdentifier",
        "SourceDbClusterResourceId",
        "SourceRegion",
        "StorageEncrypted",
        "UseLatestRestorableTime",
        "WithExpressConfiguration"
      ],
      primaryIdentifier: ["DBClusterIdentifier"]
    },
    "AWS::RDS::DBClusterEndpoint": {
      createOnly: ["DBClusterEndpointIdentifier", "DBClusterIdentifier"],
      primaryIdentifier: ["DBClusterEndpointArn"]
    },
    "AWS::RDS::DBClusterParameterGroup": {
      createOnly: ["DBClusterParameterGroupName", "Description", "Family"],
      primaryIdentifier: ["DBClusterParameterGroupName"]
    },
    "AWS::RDS::DBInstance": {
      createOnly: [
        "BackupTarget",
        "CharacterSetName",
        "CustomIAMInstanceProfile",
        "DBClusterIdentifier",
        "DBInstanceIdentifier",
        "DBName",
        "DBSubnetGroupName",
        "DBSystemId",
        "KmsKeyId",
        "MasterUsername",
        "NcharCharacterSetName",
        "SourceRegion",
        "StorageEncrypted",
        "Timezone"
      ],
      primaryIdentifier: ["DBInstanceIdentifier"]
    },
    "AWS::RDS::DBParameterGroup": {
      createOnly: ["DBParameterGroupName", "Description", "Family"],
      primaryIdentifier: ["DBParameterGroupName"]
    },
    "AWS::RDS::DBProxy": {
      createOnly: [
        "DBProxyName",
        "EndpointNetworkType",
        "EngineFamily",
        "TargetConnectionNetworkType",
        "VpcSubnetIds"
      ],
      primaryIdentifier: ["DBProxyName"]
    },
    "AWS::RDS::DBProxyEndpoint": {
      createOnly: ["DBProxyEndpointName", "DBProxyName", "EndpointNetworkType", "VpcSubnetIds"],
      primaryIdentifier: ["DBProxyEndpointName"]
    },
    "AWS::RDS::DBProxyTargetGroup": {
      createOnly: ["DBProxyName", "TargetGroupName"],
      primaryIdentifier: ["TargetGroupArn"]
    },
    "AWS::RDS::DBSecurityGroup": {
      createOnly: ["EC2VpcId", "GroupDescription"],
      primaryIdentifier: ["Id"]
    },
    "AWS::RDS::DBSecurityGroupIngress": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::RDS::DBShardGroup": {
      createOnly: ["DBClusterIdentifier", "DBShardGroupIdentifier", "PubliclyAccessible"],
      primaryIdentifier: ["DBShardGroupIdentifier"]
    },
    "AWS::RDS::DBSnapshot": {
      createOnly: ["DBInstanceIdentifier", "DBSnapshotIdentifier"],
      primaryIdentifier: ["DBSnapshotArn"]
    },
    "AWS::RDS::DBSubnetGroup": {
      createOnly: ["DBSubnetGroupName"],
      primaryIdentifier: ["DBSubnetGroupName"]
    },
    "AWS::RDS::Deployment": {
      createOnly: [
        "BlueGreenDeploymentName",
        "Source",
        "TargetAllocatedStorage",
        "TargetDBClusterParameterGroupName",
        "TargetDBInstanceClass",
        "TargetDBParameterGroupName",
        "TargetEngineVersion",
        "TargetIops",
        "TargetStorageThroughput",
        "TargetStorageType",
        "UpgradeTargetStorageConfig"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::RDS::EventSubscription": {
      createOnly: ["SnsTopicArn", "SubscriptionName"],
      primaryIdentifier: ["SubscriptionName"]
    },
    "AWS::RDS::GlobalCluster": {
      createOnly: [
        "Engine",
        "GlobalClusterIdentifier",
        "SourceDBClusterIdentifier",
        "StorageEncrypted"
      ],
      primaryIdentifier: ["GlobalClusterIdentifier"]
    },
    "AWS::RDS::Integration": {
      createOnly: ["AdditionalEncryptionContext", "KMSKeyId", "SourceArn", "TargetArn"],
      primaryIdentifier: ["IntegrationArn"]
    },
    "AWS::RDS::OptionGroup": {
      createOnly: [
        "EngineName",
        "MajorEngineVersion",
        "OptionGroupDescription",
        "OptionGroupName"
      ],
      primaryIdentifier: ["OptionGroupName"]
    },
    "AWS::Route53::CidrCollection": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Route53::DNSSEC": {
      createOnly: ["HostedZoneId"],
      primaryIdentifier: ["HostedZoneId"]
    },
    "AWS::Route53::DelegationSet": {
      createOnly: [],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Route53::HealthCheck": {
      createOnly: [
        "HealthCheckConfig/MeasureLatency",
        "HealthCheckConfig/RequestInterval",
        "HealthCheckConfig/Type"
      ],
      primaryIdentifier: ["HealthCheckId"]
    },
    "AWS::Route53::HostedZone": {
      createOnly: ["DelegationSetId", "Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Route53::KeySigningKey": {
      createOnly: ["HostedZoneId", "KeyManagementServiceArn", "Name"],
      primaryIdentifier: ["HostedZoneId", "Name"]
    },
    "AWS::Route53::QueryLoggingConfig": {
      createOnly: ["CloudWatchLogsLogGroupArn", "HostedZoneId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Route53::RecordSet": {
      createOnly: ["HostedZoneId", "HostedZoneName"],
      primaryIdentifier: ["Name", "HostedZoneId", "Type", "SetIdentifier"]
    },
    "AWS::Route53::RecordSetGroup": {
      createOnly: ["HostedZoneId", "HostedZoneName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Route53::TrafficPolicy": {
      createOnly: ["Document", "Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Route53::TrafficPolicyInstance": {
      createOnly: ["HostedZoneId", "Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::S3::AccessGrant": {
      createOnly: ["S3PrefixType", "Tags"],
      primaryIdentifier: ["AccessGrantId"]
    },
    "AWS::S3::AccessGrantsInstance": {
      createOnly: ["Tags"],
      primaryIdentifier: ["AccessGrantsInstanceArn"]
    },
    "AWS::S3::AccessGrantsLocation": {
      createOnly: ["Tags"],
      primaryIdentifier: ["AccessGrantsLocationId"]
    },
    "AWS::S3::AccessPoint": {
      createOnly: ["Bucket", "BucketAccountId", "Name", "VpcConfiguration"],
      primaryIdentifier: ["Name"]
    },
    "AWS::S3::Bucket": {
      createOnly: ["BucketName", "BucketNamePrefix", "BucketNamespace"],
      primaryIdentifier: ["BucketName"]
    },
    "AWS::S3::BucketPolicy": {
      createOnly: ["Bucket"],
      primaryIdentifier: ["Bucket"]
    },
    "AWS::S3::MultiRegionAccessPoint": {
      createOnly: ["Name", "PublicAccessBlockConfiguration", "Regions"],
      primaryIdentifier: ["Name"]
    },
    "AWS::S3::MultiRegionAccessPointPolicy": {
      createOnly: ["MrapName"],
      primaryIdentifier: ["MrapName"]
    },
    "AWS::S3::StorageLens": {
      createOnly: ["StorageLensConfiguration/Id"],
      primaryIdentifier: ["StorageLensConfiguration/Id"]
    },
    "AWS::S3::StorageLensGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SES::ConfigurationSet": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SES::ConfigurationSetEventDestination": {
      createOnly: ["ConfigurationSetName"],
      primaryIdentifier: ["Id", "ConfigurationSetName"]
    },
    "AWS::SES::ContactList": {
      createOnly: ["ContactListName"],
      primaryIdentifier: ["ContactListName"]
    },
    "AWS::SES::CustomVerificationEmailTemplate": {
      createOnly: ["TemplateName"],
      primaryIdentifier: ["TemplateName"]
    },
    "AWS::SES::DedicatedIpPool": {
      createOnly: ["PoolName"],
      primaryIdentifier: ["PoolName"]
    },
    "AWS::SES::EmailIdentity": {
      createOnly: ["EmailIdentity"],
      primaryIdentifier: ["EmailIdentity"]
    },
    "AWS::SES::EmailIdentityCertificate": {
      createOnly: ["CertificateArn", "EmailIdentity", "FromAddress"],
      primaryIdentifier: ["EmailIdentity", "FromAddress"]
    },
    "AWS::SES::MailManagerAddonInstance": {
      createOnly: ["AddonSubscriptionId"],
      primaryIdentifier: ["AddonInstanceId"]
    },
    "AWS::SES::MailManagerAddonSubscription": {
      createOnly: ["AddonName"],
      primaryIdentifier: ["AddonSubscriptionId"]
    },
    "AWS::SES::MailManagerAddressList": {
      createOnly: ["AddressListName"],
      primaryIdentifier: ["AddressListId"]
    },
    "AWS::SES::MailManagerArchive": {
      createOnly: ["KmsKeyArn"],
      primaryIdentifier: ["ArchiveId"]
    },
    "AWS::SES::MailManagerIngressPoint": {
      createOnly: ["NetworkConfiguration", "Type"],
      primaryIdentifier: ["IngressPointId"]
    },
    "AWS::SES::MailManagerRelay": {
      createOnly: [],
      primaryIdentifier: ["RelayId"]
    },
    "AWS::SES::MailManagerRuleSet": {
      createOnly: [],
      primaryIdentifier: ["RuleSetId"]
    },
    "AWS::SES::MailManagerTrafficPolicy": {
      createOnly: [],
      primaryIdentifier: ["TrafficPolicyId"]
    },
    "AWS::SES::MultiRegionEndpoint": {
      createOnly: ["Details", "EndpointName"],
      primaryIdentifier: ["EndpointName"]
    },
    "AWS::SES::ReceiptFilter": {
      createOnly: [
        "Filter",
        "Filter/IpFilter",
        "Filter/IpFilter/Cidr",
        "Filter/IpFilter/Policy",
        "Filter/Name"
      ],
      primaryIdentifier: ["Id"]
    },
    "AWS::SES::ReceiptRule": {
      createOnly: ["Rule/Name", "RuleSetName"],
      primaryIdentifier: ["RuleName", "RuleSetName"]
    },
    "AWS::SES::ReceiptRuleSet": {
      createOnly: ["RuleSetName"],
      primaryIdentifier: ["RuleSetName"]
    },
    "AWS::SES::Template": {
      createOnly: ["Template/TemplateName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SES::Tenant": {
      createOnly: ["TenantName"],
      primaryIdentifier: ["TenantName"]
    },
    "AWS::SES::VdmAttributes": {
      createOnly: [],
      primaryIdentifier: ["VdmAttributesResourceId"]
    },
    "AWS::SNS::Subscription": {
      createOnly: ["Endpoint", "Protocol", "TopicArn"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::SNS::Topic": {
      createOnly: ["FifoTopic", "TopicName"],
      primaryIdentifier: ["TopicArn"]
    },
    "AWS::SNS::TopicInlinePolicy": {
      createOnly: ["TopicArn"],
      primaryIdentifier: ["TopicArn"]
    },
    "AWS::SNS::TopicPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::SQS::Queue": {
      createOnly: ["FifoQueue", "QueueName"],
      primaryIdentifier: ["QueueUrl"]
    },
    "AWS::SQS::QueueInlinePolicy": {
      createOnly: ["Queue"],
      primaryIdentifier: ["Queue"]
    },
    "AWS::SQS::QueuePolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::SSM::Association": {
      createOnly: ["InstanceId"],
      primaryIdentifier: ["AssociationId"]
    },
    "AWS::SSM::CloudConnector": {
      createOnly: ["ConfigConnectorArn", "Configuration/AzureConfiguration/TenantId", "RoleArn"],
      primaryIdentifier: ["CloudConnectorArn"]
    },
    "AWS::SSM::Document": {
      createOnly: ["DocumentType", "Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SSM::MaintenanceWindow": {
      createOnly: [],
      primaryIdentifier: ["WindowId"]
    },
    "AWS::SSM::MaintenanceWindowTarget": {
      createOnly: ["WindowId"],
      primaryIdentifier: ["WindowId", "WindowTargetId"]
    },
    "AWS::SSM::MaintenanceWindowTask": {
      createOnly: ["TaskType", "WindowId"],
      primaryIdentifier: ["WindowId", "WindowTaskId"]
    },
    "AWS::SSM::OpsItem": {
      createOnly: ["Source"],
      primaryIdentifier: ["OpsItemArn"]
    },
    "AWS::SSM::Parameter": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SSM::PatchBaseline": {
      createOnly: ["OperatingSystem"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SSM::ResourceDataSync": {
      createOnly: [
        "BucketName",
        "BucketPrefix",
        "BucketRegion",
        "KMSKeyArn",
        "S3Destination",
        "SyncFormat",
        "SyncName",
        "SyncType"
      ],
      primaryIdentifier: ["SyncName"]
    },
    "AWS::SSM::ResourcePolicy": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["PolicyId", "ResourceArn"]
    },
    "AWS::SSM::ServiceSetting": {
      createOnly: ["SettingId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Scheduler::Schedule": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Scheduler::ScheduleGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SecretsManager::ResourcePolicy": {
      createOnly: ["SecretId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SecretsManager::RotationSchedule": {
      createOnly: ["SecretId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SecretsManager::Secret": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SecretsManager::SecretTargetAttachment": {
      createOnly: ["SecretId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::StepFunctions::Activity": {
      createOnly: ["EncryptionConfiguration", "Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::StepFunctions::StateMachine": {
      createOnly: ["StateMachineName", "StateMachineType"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::StepFunctions::StateMachineAlias": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::StepFunctions::StateMachineVersion": {
      createOnly: ["Description", "StateMachineArn", "StateMachineRevisionId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::WAFv2::IPSet": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::LoggingConfiguration": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::WAFv2::RegexPatternSet": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::RuleGroup": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::WebACL": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::WebACLAssociation": {
      createOnly: ["ResourceArn", "WebACLArn"],
      primaryIdentifier: ["ResourceArn", "WebACLArn"]
    },
    "AWS::XRay::Group": {
      createOnly: [],
      primaryIdentifier: ["GroupARN"]
    },
    "AWS::XRay::ResourcePolicy": {
      createOnly: ["PolicyName"],
      primaryIdentifier: ["PolicyName"]
    },
    "AWS::XRay::SamplingRule": {
      createOnly: ["SamplingRule/Version"],
      primaryIdentifier: ["RuleARN"]
    },
    "AWS::XRay::TransactionSearchConfig": {
      createOnly: ["CloudWatchLogsConfiguration"],
      primaryIdentifier: ["AccountId"]
    }
  }
};

// ../../../packages/template-analysis/src/catalog.ts
var replacement = replacement_default;
var REPLACEMENT_DATA_SOURCE = replacement.source;
var REPLACEMENT_DATA_DATE = replacement.retrieved;
var SUPPLEMENT_NOTE = replacement.supplement.note;

// ../../../packages/context-contract/src/config.ts
var MAX_CONFIG_BYTES = 64 * 1024;

// ../../../packages/context-contract/src/schema.ts
var MAX_SNAPSHOT_BYTES = 16 * 1024;

// ../../../packages/report-contract/src/types.ts
var SCHEMA_VERSION = "1";

// ../../../packages/report-contract/src/validate.ts
var MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
var MAX_STRING = 2e4;
var MAX_ITEMS = 5e3;
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var str = (value, path) => typeof value === "string" && value.length <= MAX_STRING ? null : `${path} must be a string`;
var num = (value, path) => typeof value === "number" && Number.isFinite(value) ? null : `${path} must be a number`;
var bool = (value, path) => typeof value === "boolean" ? null : `${path} must be a boolean`;
var isoDate = (value, path) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? null : `${path} must be a date string`;
var nullable = (check) => (value, path) => value === null ? null : check(value, path);
var oneOf = (...allowed) => (value, path) => typeof value === "string" && allowed.includes(value) ? null : `${path} must be one of ${allowed.join(", ")}`;
var list = (item) => (value, path) => {
  if (!Array.isArray(value)) return `${path} must be a list`;
  if (value.length > MAX_ITEMS) return `${path} has too many items`;
  for (let i = 0; i < value.length; i += 1) {
    const problem = item(value[i], `${path}[${i}]`);
    if (problem !== null) return problem;
  }
  return null;
};
var strings = list(str);
var shape = (required, optional = {}) => (value, path) => {
  if (!isRecord(value)) return `${path} must be an object`;
  for (const [key, check] of Object.entries(required)) {
    const problem = check(value[key], `${path}.${key}`);
    if (problem !== null) return problem;
  }
  for (const [key, check] of Object.entries(optional)) {
    if (value[key] === void 0) continue;
    const problem = check(value[key], `${path}.${key}`);
    if (problem !== null) return problem;
  }
  return null;
};
var version = (value, path) => value === SCHEMA_VERSION ? null : `${path} must be "${SCHEMA_VERSION}" (unsupported schema version)`;
var context = shape({
  accountId: nullable(str),
  region: nullable(str),
  profile: nullable(str),
  identityVerified: bool,
  environment: oneOf("production", "non-production", "unknown")
});
var finding = shape(
  {
    id: str,
    ruleId: str,
    plugin: str,
    severity: oneOf("info", "low", "medium", "high", "critical"),
    status: oneOf("confirmed", "hypothesis", "informational"),
    source: oneOf("static", "account", "model"),
    title: str,
    explanation: str,
    evidence: list(shape({ type: str, reference: str }, { observedAt: str })),
    fingerprint: str
  },
  { affectedResources: strings, recommendation: str, confidence: oneOf("low", "medium", "high") }
);
var analysisReport = shape(
  {
    schemaVersion: version,
    plugin: str,
    generatedAt: isoDate,
    context,
    mode: oneOf("local", "read-only-cloud", "planned-change", "executed-change"),
    summary: str,
    findings: list(finding),
    limitations: strings
  },
  { suppressed: num }
);
var templateDiff = shape({
  schemaVersion: version,
  plugin: str,
  generatedAt: isoDate,
  context,
  method: oneOf("template", "change-set"),
  baseline: str,
  candidate: str,
  changes: list(
    shape(
      {
        logicalId: str,
        resourceType: str,
        action: oneOf("create", "update", "replace", "possible-replace", "delete", "unknown"),
        properties: strings,
        stateful: bool
      },
      { retained: bool, note: str }
    )
  ),
  summary: shape({
    create: num,
    update: num,
    replace: num,
    possibleReplace: num,
    delete: num,
    unknown: num
  }),
  limitations: strings
});
var testReport = shape(
  {
    schemaVersion: version,
    plugin: str,
    generatedAt: isoDate,
    framework: str,
    command: str,
    passed: num,
    failed: num,
    skipped: num,
    durationMs: num,
    failures: list(shape({ name: str, message: str }, { file: str })),
    truncated: bool,
    limitations: strings
  },
  { coverage: shape({}, { lines: num, branches: num, functions: num, statements: num }) }
);
var costEstimate = shape({
  schemaVersion: version,
  plugin: str,
  generatedAt: isoDate,
  kind: oneOf("estimated", "forecast", "actual"),
  currency: oneOf("USD"),
  region: str,
  rateDate: str,
  assumptions: strings,
  exclusions: strings,
  lines: list(
    shape({
      service: str,
      description: str,
      quantity: num,
      unit: str,
      unitPrice: num,
      monthly: num
    })
  ),
  totalMonthly: num,
  limitations: strings
});
var timeSeries = shape({
  schemaVersion: version,
  namespace: str,
  metric: str,
  statistic: str,
  unit: str,
  periodSeconds: num,
  start: isoDate,
  end: isoDate,
  dimensions: (value, path) => isRecord(value) && Object.values(value).every((entry) => typeof entry === "string") ? null : `${path} must map names to strings`,
  points: list(shape({ t: isoDate, v: nullable(num) }))
});
var architecturePlan = shape({
  schemaVersion: version,
  title: str,
  generatedAt: isoDate,
  requirements: (value, path) => isRecord(value) && Object.values(value).every((entry) => typeof entry === "string") ? null : `${path} must map names to strings`,
  components: list(shape({ id: str, kind: str, name: str, purpose: str })),
  integrations: list(
    shape({ from: str, to: str, style: oneOf("sync", "async", "event") }, { note: str })
  ),
  assumptions: strings,
  risks: strings,
  openQuestions: strings
});
function make(check) {
  const validate = (value) => {
    const problem = check(value, "$");
    return problem === null ? { ok: true, value } : { ok: false, error: problem };
  };
  const parse = (text2) => {
    if (text2.length > MAX_DOCUMENT_BYTES) return { ok: false, error: "document is too large" };
    let value;
    try {
      value = JSON.parse(text2);
    } catch {
      return { ok: false, error: "not valid JSON" };
    }
    return validate(value);
  };
  return { validate, parse };
}
var reportCodec = make(analysisReport);
var findingCodec = make(finding);
var diffCodec = make(templateDiff);
var testReportCodec = make(testReport);
var costCodec = make(costEstimate);
var timeSeriesCodec = make(timeSeries);
var planCodec = make(architecturePlan);

// ../../../packages/template-analysis/src/template.ts
var MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;
var MAX_RESOURCES = 5e3;
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function names(value) {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
function parseTemplate(source) {
  let document = source;
  if (typeof source === "string") {
    if (source.length > MAX_TEMPLATE_BYTES) return { ok: false, error: "template is too large" };
    try {
      document = JSON.parse(source);
    } catch {
      return { ok: false, error: "template is not valid JSON (YAML templates are not supported)" };
    }
  }
  if (!isRecord2(document)) return { ok: false, error: "template must be a JSON object" };
  const resourcesValue = document["Resources"];
  if (!isRecord2(resourcesValue)) return { ok: false, error: "template has no Resources section" };
  const ids = Object.keys(resourcesValue);
  if (ids.length > MAX_RESOURCES) return { ok: false, error: "template has too many resources" };
  const resources = {};
  for (const logicalId of ids) {
    const entry = resourcesValue[logicalId];
    if (!isRecord2(entry) || typeof entry["Type"] !== "string") {
      return { ok: false, error: `resource ${logicalId} has no Type` };
    }
    resources[logicalId] = {
      logicalId,
      type: entry["Type"],
      properties: isRecord2(entry["Properties"]) ? entry["Properties"] : {},
      deletionPolicy: stringOrNull(entry["DeletionPolicy"]),
      updateReplacePolicy: stringOrNull(entry["UpdateReplacePolicy"]),
      dependsOn: names(entry["DependsOn"]),
      condition: stringOrNull(entry["Condition"]),
      metadata: isRecord2(entry["Metadata"]) ? entry["Metadata"] : {}
    };
  }
  return {
    ok: true,
    template: {
      resources,
      parameters: isRecord2(document["Parameters"]) ? document["Parameters"] : {},
      outputs: isRecord2(document["Outputs"]) ? document["Outputs"] : {},
      conditions: isRecord2(document["Conditions"]) ? document["Conditions"] : {},
      raw: document
    }
  };
}
function resourcesOfType(template, ...types) {
  return Object.values(template.resources).filter((resource) => types.includes(resource.type));
}
function isRetained(resource) {
  return resource.deletionPolicy === "Retain" || resource.deletionPolicy === "RetainExceptOnCreate";
}

// ../../../packages/template-analysis/src/iam.ts
var UNRESOLVED = "<unresolved>";
var isRecord3 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function strings2(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return value.map((entry) => typeof entry === "string" ? entry : UNRESOLVED);
  return value === void 0 ? [] : [UNRESOLVED];
}
function principals(value) {
  if (value === "*") return ["*"];
  if (!isRecord3(value)) return value === void 0 ? [] : [UNRESOLVED];
  return Object.entries(value).flatMap(
    ([type, inner]) => strings2(inner).map((entry) => `${type}:${entry}`)
  );
}
function fromDocument(document, base, path) {
  if (!isRecord3(document)) return [];
  const raw = document["Statement"];
  const list3 = Array.isArray(raw) ? raw : raw === void 0 ? [] : [raw];
  const out = [];
  list3.forEach((entry, index) => {
    if (!isRecord3(entry)) return;
    out.push({
      ...base,
      effect: typeof entry["Effect"] === "string" ? entry["Effect"] : UNRESOLVED,
      actions: strings2(entry["Action"]),
      notActions: strings2(entry["NotAction"]),
      resources: strings2(entry["Resource"]),
      notResources: strings2(entry["NotResource"]),
      principals: principals(entry["Principal"]),
      hasCondition: isRecord3(entry["Condition"]) && Object.keys(entry["Condition"]).length > 0,
      condition: isRecord3(entry["Condition"]) ? entry["Condition"] : null,
      sid: typeof entry["Sid"] === "string" ? entry["Sid"] : null,
      path: `${path}/Statement/${index}`
    });
  });
  return out;
}
function iamStatements(template) {
  const out = [];
  for (const resource of Object.values(template.resources)) {
    const { logicalId: owner, type: ownerType, properties } = resource;
    const at = `Resources/${owner}/Properties`;
    const identity = { owner, ownerType, kind: "identity" };
    const resourcePolicy = { owner, ownerType, kind: "resource" };
    switch (ownerType) {
      case "AWS::IAM::Role":
        out.push(
          ...fromDocument(
            properties["AssumeRolePolicyDocument"],
            { owner, ownerType, kind: "trust" },
            `${at}/AssumeRolePolicyDocument`
          )
        );
        if (Array.isArray(properties["Policies"])) {
          properties["Policies"].forEach((policy, index) => {
            if (isRecord3(policy))
              out.push(
                ...fromDocument(
                  policy["PolicyDocument"],
                  identity,
                  `${at}/Policies/${index}/PolicyDocument`
                )
              );
          });
        }
        break;
      case "AWS::IAM::User":
      case "AWS::IAM::Group":
        if (Array.isArray(properties["Policies"])) {
          properties["Policies"].forEach((policy, index) => {
            if (isRecord3(policy))
              out.push(
                ...fromDocument(
                  policy["PolicyDocument"],
                  identity,
                  `${at}/Policies/${index}/PolicyDocument`
                )
              );
          });
        }
        break;
      case "AWS::IAM::Policy":
      case "AWS::IAM::ManagedPolicy":
        out.push(...fromDocument(properties["PolicyDocument"], identity, `${at}/PolicyDocument`));
        break;
      case "AWS::SQS::QueuePolicy":
      case "AWS::SNS::TopicPolicy":
      case "AWS::S3::BucketPolicy":
        out.push(
          ...fromDocument(properties["PolicyDocument"], resourcePolicy, `${at}/PolicyDocument`)
        );
        break;
      case "AWS::SecretsManager::ResourcePolicy":
        out.push(
          ...fromDocument(properties["ResourcePolicy"], resourcePolicy, `${at}/ResourcePolicy`)
        );
        break;
      case "AWS::KMS::Key":
        out.push(...fromDocument(properties["KeyPolicy"], resourcePolicy, `${at}/KeyPolicy`));
        break;
      case "AWS::ApiGateway::RestApi":
        out.push(...fromDocument(properties["Policy"], resourcePolicy, `${at}/Policy`));
        break;
      case "AWS::ECR::Repository":
        out.push(
          ...fromDocument(
            properties["RepositoryPolicyText"],
            resourcePolicy,
            `${at}/RepositoryPolicyText`
          )
        );
        break;
      case "AWS::DynamoDB::Table":
        if (isRecord3(properties["ResourcePolicy"])) {
          out.push(
            ...fromDocument(
              properties["ResourcePolicy"]["PolicyDocument"],
              resourcePolicy,
              `${at}/ResourcePolicy/PolicyDocument`
            )
          );
        }
        break;
      case "AWS::Lambda::Permission":
        out.push({
          ...resourcePolicy,
          effect: "Allow",
          actions: strings2(properties["Action"]),
          notActions: [],
          resources: strings2(properties["FunctionName"]),
          notResources: [],
          principals: strings2(properties["Principal"]).map(
            (entry) => entry === "*" ? "*" : `Principal:${entry}`
          ),
          hasCondition: [
            "SourceArn",
            "SourceAccount",
            "PrincipalOrgID",
            "FunctionUrlAuthType"
          ].some(
            (key) => properties[key] !== void 0 && properties["FunctionUrlAuthType"] !== "NONE"
          ),
          condition: null,
          sid: null,
          path: at
        });
        break;
      default:
        break;
    }
  }
  return out;
}

// ../../../packages/template-analysis/src/runtimes.ts
var DEPRECATION = {
  "nodejs24.x": "2028-04-30",
  "nodejs22.x": "2027-04-30",
  "nodejs20.x": "2026-04-30",
  "nodejs18.x": "2025-09-01",
  "nodejs16.x": "2024-06-12",
  "nodejs14.x": "2023-12-04",
  "nodejs12.x": "2023-03-31",
  "nodejs10.x": "2021-07-30",
  "nodejs8.10": "2020-03-06",
  "nodejs6.10": "2019-08-12",
  "nodejs4.3": "2020-03-05",
  "nodejs4.3-edge": "2020-03-05",
  nodejs: "2016-08-30",
  "python3.14": "2029-06-30",
  "python3.13": "2029-06-30",
  "python3.12": "2028-10-31",
  "python3.11": "2027-06-30",
  "python3.10": "2026-10-31",
  "python3.9": "2025-12-15",
  "python3.8": "2024-10-14",
  "python3.7": "2023-12-04",
  "python3.6": "2022-07-18",
  "python2.7": "2021-07-15",
  java25: "2029-06-30",
  java21: "2029-06-30",
  "java17.al2023": "2029-06-30",
  "java11.al2023": "2029-06-30",
  "java8.al2023": "2029-06-30",
  java17: "2027-06-30",
  java11: "2027-06-30",
  "java8.al2": "2027-06-30",
  java8: "2024-01-08",
  dotnet10: "2028-11-14",
  dotnet9: "2026-11-10",
  dotnet8: "2026-11-10",
  dotnet7: "2024-05-14",
  dotnet6: "2024-12-20",
  "dotnet5.0": "2022-05-10",
  "dotnetcore3.1": "2023-04-03",
  "dotnetcore2.1": "2022-01-05",
  "dotnetcore2.0": "2019-05-30",
  "dotnetcore1.0": "2019-06-27",
  "ruby4.0": "2029-03-31",
  "ruby3.4": "2028-03-31",
  "ruby3.3": "2027-03-31",
  "ruby3.2": "2026-03-31",
  "ruby2.7": "2023-12-07",
  "ruby2.5": "2021-07-30",
  "provided.al2023": "2029-06-30",
  "provided.al2": "2026-07-31",
  provided: "2024-01-08",
  "go1.x": "2024-01-08"
};
var PREVIEW = /* @__PURE__ */ new Set(["nodejs26.x", "python3.15"]);
var APPROACHING_DAYS = 180;
function runtimeStatus(identifier, now) {
  if (PREVIEW.has(identifier)) return { state: "preview", deprecationDate: null };
  const date = DEPRECATION[identifier];
  if (date === void 0) return { state: "unknown", deprecationDate: null };
  const ends = Date.parse(`${date}T00:00:00Z`);
  if (ends <= now.getTime()) return { state: "deprecated", deprecationDate: date };
  const days = (ends - now.getTime()) / 864e5;
  return { state: days <= APPROACHING_DAYS ? "approaching" : "supported", deprecationDate: date };
}

// ../../../packages/lens-questions/src/template-questions.ts
var isRecord4 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var ratio = (ok, total) => total === 0 ? "not-in-template" : ok === total ? "yes" : ok === 0 ? "no" : "partly";
var count = (ok, total, what) => total === 0 ? "nothing of this kind in the template" : `${ok} of ${total} ${what}`;
var firstGetAtt = (value) => JSON.stringify(value).match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ?? "";
var firstRef = (value) => JSON.stringify(value).match(/"Ref":"([^"]+)"/)?.[1] ?? "";
var dlq = (t) => {
  const queues = resourcesOfType(t, "AWS::SQS::Queue");
  const targets = new Set(
    queues.flatMap(
      (q2) => isRecord4(q2.properties["RedrivePolicy"]) ? [firstGetAtt(q2.properties["RedrivePolicy"])] : []
    )
  );
  const sources = queues.filter((q2) => !targets.has(q2.logicalId));
  const ok = sources.filter((q2) => q2.properties["RedrivePolicy"] !== void 0).length;
  return {
    answer: ratio(ok, sources.length),
    evidence: count(ok, sources.length, "source queues have a redrive policy")
  };
};
var visibility = (t) => {
  let ok = 0;
  let total = 0;
  for (const mapping of resourcesOfType(t, "AWS::Lambda::EventSourceMapping")) {
    const queue = t.resources[firstGetAtt(mapping.properties["EventSourceArn"])];
    const fn = t.resources[firstRef(mapping.properties["FunctionName"])];
    if (queue?.type !== "AWS::SQS::Queue" || fn === void 0) continue;
    total += 1;
    const v = typeof queue.properties["VisibilityTimeout"] === "number" ? queue.properties["VisibilityTimeout"] : 30;
    const timeout = typeof fn.properties["Timeout"] === "number" ? fn.properties["Timeout"] : 3;
    if (v >= timeout * 6) ok += 1;
  }
  return {
    answer: ratio(ok, total),
    evidence: count(ok, total, "queue-to-function links meet the six-times guideline")
  };
};
var tracing = (t) => {
  const fns = resourcesOfType(t, "AWS::Lambda::Function");
  const ok = fns.filter(
    (f) => isRecord4(f.properties["TracingConfig"]) && f.properties["TracingConfig"]["Mode"] === "Active"
  ).length;
  return {
    answer: ratio(ok, fns.length),
    evidence: count(ok, fns.length, "functions have active tracing")
  };
};
var alarms = (t) => {
  const n = resourcesOfType(t, "AWS::CloudWatch::Alarm").length;
  const watched = resourcesOfType(t, "AWS::Lambda::Function", "AWS::SQS::Queue").length;
  return {
    answer: watched === 0 ? "not-in-template" : n === 0 ? "no" : "partly",
    evidence: `${n} alarm(s) for ${watched} function(s) and queue(s). Whether they cover the right signals needs a reading of their definitions.`
  };
};
var logRetention = (t) => {
  const groups = resourcesOfType(t, "AWS::Logs::LogGroup");
  const ok = groups.filter((g) => g.properties["RetentionInDays"] !== void 0).length;
  return groups.length === 0 ? {
    answer: "no",
    evidence: "No log group is defined in the template, so each function's log group is created by Lambda and never expires."
  } : {
    answer: ratio(ok, groups.length),
    evidence: count(ok, groups.length, "log groups set a retention period")
  };
};
var authorizer = (t) => {
  const routes = resourcesOfType(t, "AWS::ApiGatewayV2::Route");
  const methods = resourcesOfType(t, "AWS::ApiGateway::Method").filter(
    (m) => m.properties["HttpMethod"] !== "OPTIONS"
  );
  const total = routes.length + methods.length;
  const ok = [...routes, ...methods].filter(
    (r) => (r.properties["AuthorizationType"] ?? "NONE") !== "NONE"
  ).length;
  return {
    answer: ratio(ok, total),
    evidence: `${count(ok, total, "routes have an authorizer")}. Whether the handler checks that this caller may touch this data (tenant isolation) is not visible in a template.`
  };
};
var leastPrivilege = (t) => {
  const allows = iamStatements(t).filter((s) => s.effect === "Allow" && s.kind === "identity");
  const broad = allows.filter(
    (s) => s.actions.includes("*") || s.actions.some((a) => a.endsWith(":*")) || s.resources.includes("*") && !s.actions.every((a) => /^(xray|logs):/.test(a))
  ).length;
  return {
    answer: allows.length === 0 ? "not-in-template" : broad === 0 ? "yes" : broad === allows.length ? "no" : "partly",
    evidence: `${broad} of ${allows.length} allow statements use a wildcard action or an unrestricted resource.`
  };
};
var publicAccess = (t) => {
  const buckets = resourcesOfType(t, "AWS::S3::Bucket");
  const ok = buckets.filter((b) => {
    const cfg = b.properties["PublicAccessBlockConfiguration"];
    return isRecord4(cfg) && Object.values(cfg).every((v) => v === true);
  }).length;
  return {
    answer: ratio(ok, buckets.length),
    evidence: count(ok, buckets.length, "buckets block public access")
  };
};
var topicEncryption = (t) => {
  const topics = resourcesOfType(t, "AWS::SNS::Topic");
  const ok = topics.filter((x) => x.properties["KmsMasterKeyId"] !== void 0).length;
  return {
    answer: ratio(ok, topics.length),
    evidence: count(ok, topics.length, "topics set a KMS key")
  };
};
var tableBackups = (t) => {
  const tables = resourcesOfType(t, "AWS::DynamoDB::Table");
  const ok = tables.filter((x) => {
    const spec = x.properties["PointInTimeRecoverySpecification"];
    return isRecord4(spec) && spec["PointInTimeRecoveryEnabled"] === true;
  }).length;
  return {
    answer: ratio(ok, tables.length),
    evidence: count(ok, tables.length, "tables enable point-in-time recovery")
  };
};
var retainState = (t) => {
  const stateful = resourcesOfType(
    t,
    "AWS::DynamoDB::Table",
    "AWS::S3::Bucket",
    "AWS::Kinesis::Stream"
  );
  const ok = stateful.filter(isRetained).length;
  return {
    answer: ratio(ok, stateful.length),
    evidence: count(
      ok,
      stateful.length,
      "stateful resources keep a Retain policy when the stack deletes them"
    )
  };
};
var arm64 = (t) => {
  const fns = resourcesOfType(t, "AWS::Lambda::Function");
  const ok = fns.filter(
    (f) => Array.isArray(f.properties["Architectures"]) && f.properties["Architectures"].includes("arm64")
  ).length;
  return {
    answer: ratio(ok, fns.length),
    evidence: count(ok, fns.length, "functions run on arm64")
  };
};
var runtimes = (t, now) => {
  const fns = resourcesOfType(t, "AWS::Lambda::Function").filter(
    (f) => typeof f.properties["Runtime"] === "string"
  );
  const states = fns.map((f) => runtimeStatus(String(f.properties["Runtime"]), now).state);
  const deprecated = states.filter((s) => s === "deprecated").length;
  const approaching = states.filter((s) => s === "approaching").length;
  return {
    answer: fns.length === 0 ? "not-in-template" : deprecated === 0 ? "yes" : deprecated === fns.length ? "no" : "partly",
    evidence: `${deprecated} of ${fns.length} functions use a deprecated runtime${approaching > 0 ? `; ${approaching} more reach their deprecation date within about six months (plan the upgrade, not an emergency)` : ""} (table dated in template-analysis).`
  };
};

// ../../../packages/lens-questions/src/questions.ts
var FW = "https://docs.aws.amazon.com/wellarchitected/latest/framework";
var pillarPage = {
  "operational-excellence": `${FW}/operational-excellence.html`,
  security: `${FW}/security.html`,
  reliability: `${FW}/reliability.html`,
  performance: `${FW}/performance-efficiency.html`,
  cost: `${FW}/cost-optimization.html`,
  sustainability: `${FW}/sustainability.html`
};
var q = (pillar, seed) => ({
  lens: "serverless",
  source: pillarPage[pillar],
  ...seed,
  pillar
});
var QUESTIONS = [
  // Operational excellence
  q("operational-excellence", {
    id: "OPS-TRACING",
    text: "Is distributed tracing enabled on the functions?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html",
    impact: "medium",
    effort: "S",
    risk: "Without traces, a slow or failing request cannot be followed across services.",
    action: "Enable active tracing on functions and propagate trace headers.",
    verify: "A trace for a test request shows every hop.",
    specialist: "aws-observability",
    evaluate: tracing
  }),
  q("operational-excellence", {
    id: "OPS-ALARMS",
    text: "Are there alarms on the signals that show failure (errors, throttles, queue age, dead-letter depth)?",
    source: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html",
    impact: "high",
    effort: "M",
    risk: "Failures are noticed by customers instead of by the team.",
    action: "Add alarms for errors, throttles, iterator age or queue age, and dead-letter depth, each with an owner.",
    verify: "Induce a failure in a test stack and confirm the alarm fires and reaches the owner.",
    specialist: "aws-observability",
    evaluate: alarms
  }),
  q("operational-excellence", {
    id: "OPS-LOG-RETENTION",
    text: "Do logs have a defined retention period?",
    source: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html",
    impact: "low",
    effort: "S",
    risk: "Logs that never expire grow in cost and keep data longer than intended.",
    action: "Declare each log group with a retention period that matches the data policy.",
    verify: "Every log group in the template sets RetentionInDays.",
    evaluate: logRetention
  }),
  q("operational-excellence", {
    id: "OPS-RUNBOOKS",
    text: "Do runbooks or playbooks exist for the failures this workload can have, and have they been exercised?",
    impact: "medium",
    effort: "M",
    risk: "Responders improvise under pressure and repeat past mistakes.",
    action: "Write a runbook for each alarm and run a game day.",
    verify: "A teammate who did not write the runbook resolves a simulated incident with it.",
    notInTemplate: "Operating practice is not recorded in infrastructure code."
  }),
  q("operational-excellence", {
    id: "OPS-DEPLOY-SAFETY",
    text: "Are changes released gradually, with automatic rollback on alarm?",
    impact: "medium",
    effort: "M",
    risk: "A bad release reaches every user at once.",
    action: "Use aliases with gradual traffic shifting or a pipeline with approval and rollback; see aws-deploy.",
    verify: "A deliberately failing release rolls back without manual steps.",
    specialist: "aws-infrastructure",
    notInTemplate: "Release process lives in pipelines and team practice; a template shows only some of it."
  }),
  // Security
  q("security", {
    id: "SEC-AUTHZ",
    text: "Do API routes have an authorizer?",
    source: "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-to-api.html",
    impact: "high",
    effort: "M",
    risk: "An unauthenticated route lets anyone call the backend.",
    action: "Attach an authorizer to every route that is not meant to be public.",
    verify: "An unauthenticated request to each route returns 401 or 403.",
    specialist: "aws-security",
    evaluate: authorizer
  }),
  q("security", {
    id: "SEC-LEAST-PRIVILEGE",
    text: "Are permissions scoped to specific actions and resources?",
    source: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html",
    impact: "high",
    effort: "M",
    risk: "A compromised function can reach far more than it needs.",
    action: "Replace wildcards with the actions and ARNs the code uses.",
    verify: "IAM Access Analyzer policy validation and the aws-security review show no wildcard findings.",
    specialist: "aws-security",
    evaluate: leastPrivilege
  }),
  q("security", {
    id: "SEC-PUBLIC-EXPOSURE",
    text: "Are storage resources protected from public access?",
    source: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html",
    impact: "high",
    effort: "S",
    risk: "Data in a public bucket can be read by anyone.",
    action: "Enable all four S3 Block Public Access settings and serve public content through CloudFront.",
    verify: "All buckets show Block Public Access fully on.",
    specialist: "aws-security",
    evaluate: publicAccess
  }),
  q("security", {
    id: "SEC-TOPIC-ENCRYPTION",
    text: "Are SNS topics encrypted at rest with a managed key?",
    source: "https://docs.aws.amazon.com/sns/latest/dg/sns-server-side-encryption.html",
    impact: "medium",
    effort: "S",
    risk: "Message contents are stored unencrypted at rest.",
    action: "Set a KMS key on each topic.",
    verify: "Every topic in the template sets KmsMasterKeyId.",
    specialist: "aws-security",
    evaluate: topicEncryption
  }),
  q("security", {
    id: "SEC-RUNTIME-SUPPORT",
    text: "Do functions use runtimes that still receive security patches?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html",
    impact: "medium",
    effort: "M",
    risk: "A deprecated runtime no longer gets patches and eventually cannot be updated.",
    action: "Upgrade the runtime before its deprecation date.",
    verify: "No function uses a deprecated runtime.",
    specialist: "aws-security",
    evaluate: runtimes
  }),
  q("security", {
    id: "SEC-TENANT-ISOLATION",
    text: "Does the code check that the caller may access the specific data it requests (not only that the caller is signed in)?",
    impact: "high",
    effort: "M",
    risk: "One user can read or change another user's data.",
    action: "Check ownership or tenant on every data access and test it.",
    verify: "A test signed in as user A is denied user B's records.",
    specialist: "aws-security",
    notInTemplate: "Authorization decisions are made in handler code, not in a template."
  }),
  q("security", {
    id: "SEC-SECRETS",
    text: "Are secrets kept in a secrets service and never in code, environment values, or logs?",
    impact: "high",
    effort: "M",
    risk: "Secrets in code or logs leak through repositories and log access.",
    action: "Move secrets to Secrets Manager or SSM SecureString and read them at run time.",
    verify: "A secret scan of the repository and logs finds nothing.",
    specialist: "aws-security",
    notInTemplate: "A template cannot show whether code or logs contain secrets."
  }),
  // Reliability
  q("reliability", {
    id: "REL-DLQ",
    text: "Do asynchronous sources have a dead-letter queue, so failing messages are kept for inspection?",
    source: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html",
    impact: "high",
    effort: "S",
    risk: "A poison message is retried until it expires and is then lost.",
    action: "Add a redrive policy with a dead-letter queue and an alarm on its depth.",
    verify: "A forced failure ends in the dead-letter queue and alarms.",
    specialist: "aws-observability",
    evaluate: dlq
  }),
  q("reliability", {
    id: "REL-VISIBILITY",
    text: "Is each queue's visibility timeout at least six times its consumer function's timeout?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html",
    impact: "medium",
    effort: "S",
    risk: "Messages become visible again while still being processed and run twice.",
    action: "Raise the visibility timeout to at least six times the function timeout.",
    verify: "Each link meets the ratio.",
    evaluate: visibility
  }),
  q("reliability", {
    id: "REL-IDEMPOTENCY",
    text: "Are handlers idempotent, so duplicate deliveries do no harm?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html",
    impact: "high",
    effort: "M",
    risk: "Retries and duplicate deliveries repeat side effects such as double charges.",
    action: "Use an idempotency key and a conditional write, or a library that provides it.",
    verify: "Delivering the same event twice changes state once.",
    specialist: "aws-testing",
    notInTemplate: "Idempotency is a property of handler code and its data model."
  }),
  q("reliability", {
    id: "REL-BACKUP",
    text: "Is point-in-time recovery enabled on tables that hold data you cannot recreate?",
    source: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html",
    impact: "high",
    effort: "S",
    risk: "An accidental delete or bad write cannot be rolled back.",
    action: "Enable point-in-time recovery and test a restore.",
    verify: "A table restored to a past time in a test account matches expectations.",
    evaluate: tableBackups
  }),
  q("reliability", {
    id: "REL-RETAIN-STATE",
    text: "Do stateful resources keep a Retain policy so a stack deletion or replacement does not destroy data?",
    source: "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html",
    impact: "high",
    effort: "S",
    risk: "Deleting or replacing a stack deletes the data in it.",
    action: "Set DeletionPolicy and UpdateReplacePolicy to Retain (or Snapshot) on tables and buckets.",
    verify: "The template shows Retain on every stateful resource.",
    specialist: "aws-infrastructure",
    evaluate: retainState
  }),
  q("reliability", {
    id: "REL-FAILURE-TESTS",
    text: "Have failure modes (downstream outage, throttling, timeouts) been tested?",
    impact: "medium",
    effort: "M",
    risk: "The first time a dependency fails is in production.",
    action: "Test retries, timeouts, and fallbacks with injected failures.",
    verify: "A failure drill passes and is repeatable.",
    specialist: "aws-testing",
    notInTemplate: "Test history is not in a template."
  }),
  q("reliability", {
    id: "REL-QUOTAS",
    text: "Are service quotas and concurrency limits known and monitored against expected peak load?",
    impact: "medium",
    effort: "M",
    risk: "Peak load hits an account limit and requests are throttled.",
    action: "Compare expected peak with quotas and request increases ahead of time.",
    verify: "Peak load estimates sit under current quotas with margin.",
    notInTemplate: "Quotas are account settings, not template content."
  }),
  // Performance
  q("performance", {
    id: "PERF-MEMORY",
    text: "Were function memory and timeout sized from measurements?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html",
    impact: "medium",
    effort: "S",
    risk: "Too little memory is slow; too much costs more than needed.",
    action: "Measure duration at several sizes and pick the knee of the curve (see aws-cost compare lambda-memory).",
    verify: "A comparison table from measured durations backs the chosen size.",
    specialist: "aws-cost",
    notInTemplate: "A template shows the chosen values, not whether they were measured."
  }),
  q("performance", {
    id: "PERF-LATENCY-TARGET",
    text: "Is there a latency target for each user-facing path, and is it measured?",
    impact: "medium",
    effort: "M",
    risk: "Latency regressions go unnoticed until users complain.",
    action: "Define a percentile target per path and alarm on it.",
    verify: "A dashboard shows the percentile against the target.",
    specialist: "aws-observability",
    notInTemplate: "Targets and measurements are not in a template."
  }),
  q("performance", {
    id: "PERF-ACCESS-PATTERNS",
    text: "Were the data store and its keys chosen from the queries the workload needs?",
    impact: "high",
    effort: "L",
    risk: "Scans and hot partitions appear when queries do not match the key design.",
    action: "List the access patterns and check each has an efficient key or index.",
    verify: "Every listed query maps to a key or index, with no full scans.",
    notInTemplate: "Access patterns come from requirements and code."
  }),
  q("performance", {
    id: "PERF-COLD-START",
    text: "Are cold starts understood and acceptable on latency-sensitive paths?",
    impact: "low",
    effort: "M",
    risk: "The first request after idle time is slow.",
    action: "Measure init duration; reduce package size or use provisioned concurrency or SnapStart where it matters.",
    verify: "Init duration is measured and within the target.",
    specialist: "aws-observability",
    notInTemplate: "Cold start time is measured at run time."
  }),
  // Cost
  q("cost", {
    id: "COST-ON-DEMAND",
    text: "Are data stores billed in the mode that fits their traffic?",
    source: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html",
    impact: "medium",
    effort: "S",
    risk: "The wrong billing mode costs more than the right one at your traffic.",
    action: "Compare on-demand and provisioned for the measured traffic.",
    verify: "A comparison with real request counts backs the choice.",
    specialist: "aws-cost",
    notInTemplate: "Which billing mode is cheaper depends on traffic, which a template does not show."
  }),
  q("cost", {
    id: "COST-BUDGETS",
    text: "Are budgets or cost alerts set, with an owner who looks at them?",
    impact: "medium",
    effort: "S",
    risk: "A runaway cost is found on the invoice.",
    action: "Create an AWS Budget with alerts and name an owner.",
    verify: "A test alert reaches the owner.",
    specialist: "aws-cost",
    notInTemplate: "Budgets are account settings."
  }),
  q("cost", {
    id: "COST-RETENTION",
    text: "Are data and log retention periods set to what the business needs and no longer?",
    impact: "low",
    effort: "S",
    risk: "Data kept forever grows cost and risk.",
    action: "Set lifecycle rules and retention to the policy.",
    verify: "Each store has a retention rule that matches the policy.",
    notInTemplate: "The policy comes from the business; the template shows only the setting."
  }),
  q("cost", {
    id: "COST-TAGGING",
    text: "Are resources tagged so cost can be attributed to a workload and an owner?",
    impact: "low",
    effort: "S",
    risk: "Cost cannot be traced to a team or product.",
    action: "Apply a tag policy (workload, owner, environment) at the app level.",
    verify: "Cost reports group by the tags.",
    specialist: "aws-cost",
    notInTemplate: "Tag coverage needs the deployed resources as well as the template."
  }),
  // Sustainability
  q("sustainability", {
    id: "SUS-ARM64",
    text: "Do functions run on arm64 where the code allows it?",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html",
    impact: "low",
    effort: "S",
    risk: "Higher energy and cost per request than necessary.",
    action: "Build for arm64, test, and switch the architecture.",
    verify: "Functions declare arm64 and tests pass.",
    specialist: "aws-cost",
    evaluate: arm64
  }),
  q("sustainability", {
    id: "SUS-REGION",
    text: "Was the region chosen with data location, latency, and the carbon intensity of the grid in mind?",
    impact: "low",
    effort: "L",
    risk: "Avoidable emissions and latency.",
    action: "Document the region choice against the options.",
    verify: "An ADR records the regions considered.",
    notInTemplate: "The reason for a region is a decision, not a template property."
  }),
  q("sustainability", {
    id: "SUS-IDLE",
    text: "Is unused or idle capacity and data reviewed and removed on a schedule?",
    impact: "low",
    effort: "M",
    risk: "Unused resources keep consuming energy and money.",
    action: "Review resources and data on a schedule and remove what is unused.",
    verify: "A dated review exists and unused items were removed.",
    specialist: "aws-cost",
    notInTemplate: "Use needs telemetry and billing data, not just the template."
  })
];
var TEMPLATE_QUESTIONS = QUESTIONS.filter((x) => x.evaluate !== void 0);

// ../../../packages/lens-questions/src/types.ts
var PILLARS = [
  "operational-excellence",
  "security",
  "reliability",
  "performance",
  "cost",
  "sustainability"
];

// ../../../packages/safe-output/src/redact.ts
var REDACTED = "[redacted]";
var ESC = 27;
var BEL = 7;
function isInvisible(code, keepLines) {
  if (keepLines && (code === 9 || code === 10 || code === 13)) return false;
  return code < 32 || code >= 127 && code <= 159 || code >= 8234 && code <= 8238 || code >= 8294 && code <= 8297;
}
function sanitizeText(value, keepLines = false) {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === ESC) {
      const kind = value.charAt(i + 1);
      if (kind === "[") {
        i += 2;
        while (i < value.length && !(value.charCodeAt(i) >= 64 && value.charCodeAt(i) <= 126))
          i += 1;
      } else if (kind === "]") {
        i += 2;
        while (i < value.length && value.charCodeAt(i) !== BEL && value.charCodeAt(i) !== ESC)
          i += 1;
        if (value.charCodeAt(i) === ESC) i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (!isInvisible(code, keepLines)) out += value.charAt(i);
  }
  return out;
}

// ../../../packages/safe-output/src/text.ts
var CREDENTIAL_VALUE = [
  /\b(AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g
];
var SECRET_PAIR = /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|authorization|credential|private[_-]?key|session[_-]?token)[A-Za-z0-9_.-]*)(["']?\s*[:=]\s*["']?)(?!\[redacted\])([^\s"',;}&]{3,})/gi;
var TOKEN_COUNT_NAME = /(?:max|min|input|output|total|prompt|completion|usage)[_-]?tokens$/i;
var BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
var EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
var CARD = /\b(?:\d[ -]?){13,19}\b/g;
function luhn(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}
function redactText(input, options = {}) {
  let redacted = 0;
  let text2 = sanitizeText(input, true);
  const replace = () => {
    redacted += 1;
    return REDACTED;
  };
  for (const pattern of CREDENTIAL_VALUE) text2 = text2.replace(pattern, replace);
  text2 = text2.replace(BEARER, (_match, scheme) => `${scheme} ${replace()}`);
  text2 = text2.replace(
    SECRET_PAIR,
    (match, name, separator, value) => (
      // A model's token budget (`maxTokens: 200`) is a count, not a credential.
      TOKEN_COUNT_NAME.test(name) && /^\d+$/.test(value) ? match : `${name}${separator}${replace()}`
    )
  );
  if (options.personalData !== false) {
    text2 = text2.replace(EMAIL, replace);
    text2 = text2.replace(CARD, (match) => {
      const digits = match.replace(/[^0-9]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? replace() : match;
    });
  }
  return { text: text2, redacted };
}

// ../../../packages/template-analysis/src/node.ts
import { readdirSync, statSync } from "node:fs";
import { basename as basename2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from "node:path";

// ../../../packages/tool-runner/src/index.ts
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
function realLocation(path) {
  let current = resolve(path);
  const missing = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  return join(existsSync(current) ? realpathSync(current) : current, ...missing);
}
function isInside(root, path) {
  const rel = relative(realLocation(root), realLocation(path));
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}

// ../../../packages/template-analysis/src/node.ts
var MAX_STACKS = 100;
var TEMPLATE_SUFFIX = ".template.json";
function readTemplate(file, name, result) {
  const read = readTextBounded(file, MAX_TEMPLATE_BYTES);
  if (read.kind !== "ok") {
    result.problems.push(`${name}: the template file could not be read (${read.kind}).`);
    return;
  }
  const parsed = parseTemplate(read.text);
  if (!parsed.ok) {
    result.problems.push(`${name}: ${parsed.error}.`);
    return;
  }
  result.stacks.push({ name, file, template: parsed.template });
}
function manifestStacks(manifestText) {
  try {
    const manifest = JSON.parse(manifestText);
    const artifacts = manifest.artifacts;
    if (artifacts === void 0 || typeof artifacts !== "object") return [];
    return Object.entries(artifacts).filter(
      ([, artifact]) => artifact.type === "aws:cloudformation:stack" && typeof artifact.properties?.templateFile === "string"
    ).map(([name, artifact]) => ({
      name,
      templateFile: artifact.properties?.templateFile
    }));
  } catch {
    return [];
  }
}
function loadStacks(root, path) {
  const result = { stacks: [], problems: [] };
  const target = isAbsolute2(path) ? path : resolve2(root, path);
  if (!isInside(root, target)) {
    result.problems.push("The path is outside the project, so it was not read.");
    return result;
  }
  let info;
  try {
    info = statSync(target);
  } catch {
    result.problems.push(
      `${path} does not exist. Run \`synth\` first, or give the path of a cdk.out directory or a template.`
    );
    return result;
  }
  if (info.isFile()) {
    const name = basename2(target).replace(/(\.template)?\.json$/, "");
    readTemplate(target, name, result);
    return result;
  }
  const seen = /* @__PURE__ */ new Set();
  const manifest = readTextBounded(join2(target, "manifest.json"), 4 * 1024 * 1024);
  if (manifest.kind === "ok") {
    for (const { name, templateFile } of manifestStacks(manifest.text)) {
      if (templateFile !== basename2(templateFile)) {
        result.problems.push(
          `${name}: the manifest names a template outside the directory; skipped.`
        );
        continue;
      }
      seen.add(templateFile);
      if (result.stacks.length < MAX_STACKS) readTemplate(join2(target, templateFile), name, result);
    }
  }
  let files = [];
  try {
    files = readdirSync(target).filter((file) => file.endsWith(TEMPLATE_SUFFIX) && !seen.has(file)).sort();
  } catch {
  }
  for (const file of files) {
    if (result.stacks.length >= MAX_STACKS) {
      result.problems.push(`More than ${MAX_STACKS} templates; the rest were skipped.`);
      break;
    }
    readTemplate(join2(target, file), file.slice(0, -TEMPLATE_SUFFIX.length), result);
  }
  if (result.stacks.length === 0 && result.problems.length === 0) {
    result.problems.push(`No CloudFormation templates were found in ${path}.`);
  }
  return result;
}

// src/lib/model.ts
var CRITICALITIES = ["low", "medium", "high", "mission-critical"];
var KIND_RANK = {
  verified: 3,
  "automated-inference": 2,
  "self-reported": 1
};
var DISCLAIMER = "This is an evidence review in the spirit of the AWS Well-Architected Framework and the Serverless Applications Lens. It is not an official AWS Well-Architected Framework Review, it produces no score, and it does not certify anything. Evidence we did not see is reported as missing, never as met.";
var emptyCounts = () => ({
  evidenced: 0,
  partial: 0,
  gap: 0,
  unknown: 0,
  "not-applicable": 0
});
var emptyByPillar = () => Object.fromEntries(PILLARS.map((p) => [p, emptyCounts()]));
var isRecord5 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function parseReview(value) {
  if (!isRecord5(value) || value["schemaVersion"] !== "1" || value["kind"] !== "WellArchitectedReview")
    return { ok: false, error: "not a Well-Architected review document" };
  if (!Array.isArray(value["questions"]) || !Array.isArray(value["backlog"]) || !isRecord5(value["scope"]))
    return { ok: false, error: "the review document is incomplete" };
  for (const q2 of value["questions"]) {
    if (!isRecord5(q2) || typeof q2["id"] !== "string" || typeof q2["status"] !== "string")
      return { ok: false, error: "a question entry is malformed" };
  }
  return { ok: true, review: value };
}

// src/lib/engine.ts
var SPECIALIST_MAP = [
  ["SEC-APIGW-UNAUTHENTICATED-ROUTE", "SEC-AUTHZ"],
  ["SEC-IAM-", "SEC-LEAST-PRIVILEGE"],
  ["SEC-S3-PUBLIC-ACCESS-BLOCK", "SEC-PUBLIC-EXPOSURE"],
  ["SEC-RES-PUBLIC-PRINCIPAL", "SEC-PUBLIC-EXPOSURE"],
  ["SEC-SNS-NO-ENCRYPTION", "SEC-TOPIC-ENCRYPTION"],
  ["SEC-LAMBDA-RUNTIME-UNSUPPORTED", "SEC-RUNTIME-SUPPORT"],
  ["SEC-LAMBDA-SECRET-ENV", "SEC-SECRETS"],
  ["OBS-NO-DLQ", "REL-DLQ"],
  ["OBS-NO-TRACING", "OPS-TRACING"],
  ["OBS-LAMBDA-TIMEOUT", "PERF-MEMORY"],
  ["OBS-LAMBDA-MEMORY", "PERF-MEMORY"],
  ["OBS-LAMBDA-THROTTLED", "REL-QUOTAS"],
  ["OBS-LAMBDA-COLD-STARTS", "PERF-COLD-START"]
];
function questionFor(ruleId) {
  for (const [prefix, id] of SPECIALIST_MAP)
    if (ruleId === prefix || prefix.endsWith("-") && ruleId.startsWith(prefix)) return id;
  return null;
}
var DAY = 864e5;
var staleAfter = (scope, at, now) => {
  if (at === null) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && (now.getTime() - t) / DAY > scope.evidenceWindowDays;
};
var clean = (text2, max = 300) => redactText(text2).text.slice(0, max);
function combine(parts) {
  const real = parts.filter((a) => a !== "not-in-template");
  if (real.length === 0) return "not-in-template";
  if (real.every((a) => a === "yes")) return "yes";
  if (real.every((a) => a === "no")) return "no";
  return "partly";
}
var polarityOf = (a) => a === "yes" ? "supports" : a === "no" ? "gap" : "partial";
function templateEvidence(q2, input) {
  if (q2.evaluate === void 0 || input.stacks.length === 0) return null;
  const results = input.stacks.map((s) => ({
    name: s.name,
    result: q2.evaluate?.(s.template, input.now)
  }));
  const answers = results.flatMap((r) => r.result === void 0 ? [] : [r.result.answer]);
  const answer = combine(answers);
  if (answer === "not-in-template") return null;
  return {
    kind: "automated-inference",
    polarity: polarityOf(answer),
    statement: results.map((r) => `${r.name}: ${r.result?.evidence ?? ""}`).join(" | "),
    reference: "synthesized templates (declared, not deployed)",
    observedAt: null,
    stale: false
  };
}
function reportEvidence(q2, input) {
  const out = [];
  for (const report of input.reports)
    for (const finding2 of report.findings) {
      if (questionFor(finding2.ruleId) !== q2.id) continue;
      const verified = report.mode === "read-only-cloud" && finding2.source === "account" && finding2.status === "confirmed";
      out.push({
        kind: verified ? "verified" : "automated-inference",
        polarity: "gap",
        statement: clean(`${finding2.ruleId}: ${finding2.title}`),
        reference: `${report.plugin} report of ${report.generatedAt}`,
        observedAt: report.generatedAt,
        stale: staleAfter(input.scope, report.generatedAt, input.now)
      });
    }
  return out;
}
function answerEvidence(q2, input) {
  const records = [];
  let notApplicable = false;
  for (const a of input.answers) {
    if (a.questionId !== q2.id) continue;
    if (a.answer === "not-applicable") {
      notApplicable = true;
      continue;
    }
    const who = a.answeredBy === void 0 ? "" : ` by ${clean(a.answeredBy, 60)}`;
    records.push({
      kind: "self-reported",
      polarity: polarityOf(a.answer),
      statement: clean(`Answered "${a.answer}"${who}${a.note === void 0 ? "" : `: ${a.note}`}`),
      reference: "answers file",
      observedAt: a.answeredAt ?? null,
      stale: staleAfter(input.scope, a.answeredAt ?? null, input.now)
    });
  }
  return { records, notApplicable };
}
function resolve3(records, notApplicable) {
  if (records.length === 0)
    return {
      status: notApplicable ? "not-applicable" : "unknown",
      strongest: null,
      conflict: false
    };
  const strongest = records.reduce(
    (best, r) => KIND_RANK[r.kind] > KIND_RANK[best] ? r.kind : best,
    "self-reported"
  );
  const hasGap = records.some((r) => r.polarity === "gap");
  const hasPartial = records.some((r) => r.polarity === "partial");
  const hasSupport = records.some((r) => r.polarity === "supports");
  const conflict = hasSupport && (hasGap || hasPartial);
  const status = hasGap ? "gap" : hasPartial ? "partial" : "evidenced";
  return { status, strongest, conflict };
}
function priorityFor(q2, scope) {
  const raised = (scope.criticality === "high" || scope.criticality === "mission-critical") && (q2.pillar === "security" || q2.pillar === "reliability");
  const base = q2.impact === "high" ? 1 : q2.impact === "medium" ? 2 : 3;
  return `P${raised ? Math.max(1, base - 1) : base}`;
}
var HOW = {
  "aws-security": "Run /aws-security:review on the code, then its account checks if you have read access.",
  "aws-observability": "Run /aws-observability:status and :investigate for the function or queue, with a time window.",
  "aws-cost": "Run /aws-cost:estimate or :compare with measured numbers, and check budgets in the account.",
  "aws-infrastructure": "Run /aws-infrastructure:review on the synthesized app.",
  "aws-testing": "Run the tests (/aws-testing:run) and check coverage of failure cases."
};
function runReview(input) {
  const questions = [];
  const backlog = [];
  const missing = [];
  const byPillar = emptyByPillar();
  const mappedIds = new Set(QUESTIONS.map((q2) => q2.id));
  for (const q2 of QUESTIONS) {
    const answers = answerEvidence(q2, input);
    const template = templateEvidence(q2, input);
    const records = [
      ...template === null ? [] : [template],
      ...reportEvidence(q2, input),
      ...answers.records
    ];
    const { status, strongest, conflict } = resolve3(records, answers.notApplicable);
    questions.push({
      id: q2.id,
      pillar: q2.pillar,
      lens: q2.lens,
      text: q2.text,
      source: q2.source,
      status,
      strongest,
      conflict,
      evidence: records
    });
    byPillar[q2.pillar][status] += 1;
    if (status === "gap" || status === "partial")
      backlog.push({
        questionId: q2.id,
        pillar: q2.pillar,
        priority: priorityFor(q2, input.scope),
        status,
        risk: q2.risk,
        action: q2.action,
        effort: q2.effort,
        verify: q2.verify,
        owner: input.scope.owner === "" ? "unassigned" : input.scope.owner,
        specialist: q2.specialist ?? null,
        evidence: records.filter((r) => r.polarity !== "supports").map((r) => r.statement)
      });
    if (status === "unknown")
      missing.push({
        questionId: q2.id,
        pillar: q2.pillar,
        text: q2.text,
        whoCanAnswer: q2.specialist ?? "the team that owns the workload",
        howToGetIt: q2.specialist === void 0 ? q2.notInTemplate ?? "Answer it in the answers file." : `${HOW[q2.specialist] ?? ""} Or answer it in the answers file.`.trim()
      });
  }
  backlog.sort(
    (a, b) => a.priority.localeCompare(b.priority) || a.pillar.localeCompare(b.pillar) || a.questionId.localeCompare(b.questionId)
  );
  const unmapped = [];
  for (const report of input.reports)
    for (const finding2 of report.findings) {
      const target = questionFor(finding2.ruleId);
      if (target === null || !mappedIds.has(target))
        unmapped.push(clean(`${report.plugin} ${finding2.ruleId}: ${finding2.title}`));
    }
  const withEvidence = questions.filter((x) => x.evidence.length > 0).length;
  return {
    schemaVersion: "1",
    kind: "WellArchitectedReview",
    generatedAt: input.now.toISOString(),
    scope: input.scope,
    disclaimer: DISCLAIMER,
    coverage: {
      questions: questions.length,
      withEvidence,
      verified: questions.filter((x) => x.strongest === "verified").length
    },
    byPillar,
    questions,
    backlog,
    missing,
    unmappedFindings: unmapped,
    limitations: [
      "Templates show what is defined, not what is deployed. A passing template check is an automated inference, not verification.",
      "Self-reported answers are recorded as stated and not checked.",
      "A specialist report with no finding for a question is not evidence that the practice is met.",
      "Impact and effort per question are authored estimates, not measurements. Priority follows impact, raised one level for security and reliability when the workload is high or mission critical.",
      `Covers ${PILLARS.length} pillars with ${QUESTIONS.length} questions paraphrased from the pillar guidance; the official framework has many more.`
    ]
  };
}

// src/lib/files.ts
import { closeSync as closeSync2, mkdirSync, openSync as openSync2, writeSync } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute3, resolve as resolve4 } from "node:path";
function writeNew(root, path, content) {
  const target = isAbsolute3(path) ? path : resolve4(root, path);
  if (!isInside(root, target))
    return { ok: false, error: "the output path is outside the project" };
  try {
    mkdirSync(dirname2(target), { recursive: true });
    if (!isInside(root, target))
      return { ok: false, error: "the output path is outside the project" };
    const fd = openSync2(target, "wx");
    try {
      writeSync(fd, typeof content === "string" ? Buffer.from(content, "utf8") : content);
    } finally {
      closeSync2(fd);
    }
    return { ok: true, file: target.slice(resolve4(root).length + 1).replaceAll("\\", "/") };
  } catch (error) {
    return error.code === "EEXIST" ? {
      ok: false,
      error: `${path} already exists; it was not overwritten. Choose another --out.`
    } : { ok: false, error: "the file could not be written" };
  }
}

// src/lib/report.ts
var STATUS_LABEL = {
  evidenced: "evidenced",
  partial: "partly",
  gap: "gap",
  unknown: "no evidence",
  "not-applicable": "n/a"
};
function renderReview(r) {
  const lines = [
    `Well-Architected style review: ${r.scope.name} (${r.scope.criticality}, ${r.scope.environment}, architecture ${r.scope.architectureVersion})`,
    r.disclaimer,
    "",
    `Coverage: ${r.coverage.withEvidence} of ${r.coverage.questions} questions have any evidence; ${r.coverage.verified} are backed by verified (account) evidence.`,
    "",
    "By pillar (counts, not scores):"
  ];
  for (const pillar of PILLARS) {
    const c = r.byPillar[pillar];
    lines.push(
      `  ${pillar.padEnd(24)} ${["evidenced", "partial", "gap", "unknown", "not-applicable"].map((s) => `${STATUS_LABEL[s]} ${c[s]}`).join(", ")}`
    );
  }
  if (r.backlog.length > 0) {
    lines.push("", "Improvement backlog (highest priority first):");
    for (const item of r.backlog) {
      lines.push(
        `  ${item.priority} [${item.pillar}] ${item.questionId} (${item.status}, effort ${item.effort}, owner ${item.owner})`,
        `      Risk: ${item.risk}`,
        `      Do: ${item.action}`,
        `      Verify: ${item.verify}`,
        ...item.evidence.map((e) => `      Evidence: ${e}`),
        ...item.specialist === null ? [] : [`      Follow up with: ${item.specialist}`]
      );
    }
  }
  const conflicts = r.questions.filter((q2) => q2.conflict);
  if (conflicts.length > 0) {
    lines.push("", "Evidence that disagrees (treated as a gap until resolved):");
    for (const q2 of conflicts)
      lines.push(`  ${q2.id}: ${q2.evidence.map((e) => `${e.kind} says ${e.polarity}`).join("; ")}`);
  }
  const stale = r.questions.flatMap((q2) => q2.evidence.filter((e) => e.stale).map(() => q2.id));
  if (stale.length > 0)
    lines.push(
      "",
      `Evidence older than ${r.scope.evidenceWindowDays} days: ${[...new Set(stale)].join(", ")}`
    );
  if (r.missing.length > 0) {
    lines.push("", `Missing evidence (${r.missing.length}): these are unknown, not met.`);
    for (const m of r.missing)
      lines.push(
        `  ${m.questionId} [${m.pillar}] ${m.text}
      Who: ${m.whoCanAnswer}. ${m.howToGetIt}`
      );
  }
  if (r.unmappedFindings.length > 0) {
    lines.push(
      "",
      "Specialist findings that map to no question (kept for follow-up):",
      ...r.unmappedFindings.map((f) => `  ${f}`)
    );
  }
  lines.push("", "Limitations:", ...r.limitations.map((l) => `  - ${l}`));
  return lines.join("\n");
}
function renderImprovementPlan(r) {
  const lines = [
    `# Improvement plan: ${r.scope.name}`,
    "",
    `Generated ${r.generatedAt} from a review of architecture ${r.scope.architectureVersion}.`,
    "",
    `> ${r.disclaimer}`,
    ""
  ];
  for (const priority of ["P1", "P2", "P3"]) {
    const items = r.backlog.filter((b) => b.priority === priority);
    if (items.length === 0) continue;
    lines.push(`## ${priority}`, "");
    for (const b of items) {
      lines.push(
        `### ${b.questionId}: ${r.questions.find((q2) => q2.id === b.questionId)?.text ?? ""}`,
        "",
        `- Pillar: ${b.pillar}; status: ${b.status}; effort: ${b.effort} (rough); owner: ${b.owner}`,
        `- Risk: ${b.risk}`,
        `- Action: ${b.action}`,
        `- Done when: ${b.verify}`,
        ...b.evidence.map((e) => `- Evidence: ${e}`),
        ...b.specialist === null ? [] : [`- Investigate with: ${b.specialist}`],
        ""
      );
    }
  }
  if (r.backlog.length === 0)
    lines.push(
      "No gaps were found in the evidence that exists. That is not a statement about questions with no evidence (below).",
      ""
    );
  if (r.missing.length > 0) {
    lines.push("## Evidence to collect first", "");
    for (const m of r.missing) lines.push(`- ${m.questionId} (${m.pillar}): ${m.howToGetIt}`);
  }
  return lines.join("\n");
}
var OPEN = ["gap", "partial"];
function compareReviews(before, after) {
  const b = new Map(before.questions.map((q2) => [q2.id, q2]));
  const out = {
    resolved: [],
    regressed: [],
    stillOpen: [],
    newlyEvidenced: [],
    newQuestions: [],
    removedQuestions: [],
    unchanged: 0
  };
  for (const q2 of after.questions) {
    const old = b.get(q2.id);
    if (old === void 0) {
      out.newQuestions.push(q2.id);
      continue;
    }
    if (OPEN.includes(old.status) && q2.status === "evidenced") out.resolved.push(q2.id);
    else if (old.status === "evidenced" && (OPEN.includes(q2.status) || q2.status === "unknown"))
      out.regressed.push(q2.id);
    else if (OPEN.includes(old.status) && OPEN.includes(q2.status)) out.stillOpen.push(q2.id);
    else if (old.status === "unknown" && q2.status !== "unknown") out.newlyEvidenced.push(q2.id);
    else out.unchanged += 1;
  }
  const a = new Set(after.questions.map((q2) => q2.id));
  out.removedQuestions = before.questions.filter((q2) => !a.has(q2.id)).map((q2) => q2.id);
  return out;
}
function renderComparison(c, before, after) {
  const list3 = (title, ids) => ids.length === 0 ? [] : [`${title} (${ids.length}): ${ids.join(", ")}`];
  return [
    `Comparing ${before.generatedAt} with ${after.generatedAt}`,
    ...list3("Resolved", c.resolved),
    ...list3("Regressed", c.regressed),
    ...list3("Still open", c.stillOpen),
    ...list3("Now have evidence", c.newlyEvidenced),
    ...list3("New questions", c.newQuestions),
    ...list3("Questions no longer asked", c.removedQuestions),
    `Unchanged: ${c.unchanged}`,
    'A question moves to "resolved" only when evidence now supports it; it does not prove the practice works.'
  ].join("\n");
}

// src/lib/cli.ts
var USAGE = `Usage: aws-well-architected <command> [options]

  scope --name <n> [--criticality low|medium|high|mission-critical] [--environment e] [--version v]
        [--data <classification>] [--window <days>] [--owner o] [--stakeholders a,b] [--constraints a,b]
                                       Print a workload scope (JSON) to save and edit
  evidence-template [path]             Print an answers file to fill in: every question a template cannot answer
  review [path] [--scope f] [--answers f] [--report f]... [--write]
                                       Review cdk.out (default) with your answers and specialist reports
  improve <review.json> [--write]      Prioritized improvement plan (Markdown)
  compare <before.json> <after.json>   What was resolved, regressed, or is still open

Options: --json   --out <name> (with --write; default under docs/reviews)

Reads files inside the project. Writes only new files. No AWS calls. This is not an official AWS review and gives no score.`;
var FLAGS = ["json", "write"];
var VALUED = [
  "name",
  "criticality",
  "environment",
  "version",
  "data",
  "window",
  "owner",
  "stakeholders",
  "constraints",
  "scope",
  "answers",
  "report",
  "out"
];
var usageError = (message) => ({
  exitCode: 2,
  stdout: `${message}

${USAGE}`
});
var isRecord6 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var list2 = (v) => v === void 0 ? [] : v.split(",").map((s) => s.trim()).filter((s) => s !== "").slice(0, 20);
var text = (v, fallback, max = 200) => redactText(v ?? fallback).text.slice(0, max);
function makeScope(o) {
  const get = (k) => o.get(k)?.[0];
  const criticality = get("criticality") ?? "medium";
  if (!CRITICALITIES.includes(criticality))
    return `--criticality must be one of ${CRITICALITIES.join(", ")}`;
  const window = get("window") === void 0 ? 90 : Number(get("window"));
  if (!Number.isInteger(window) || window < 1 || window > 3650)
    return "--window must be a number of days between 1 and 3650";
  const name = get("name");
  if (name === void 0 || name.trim() === "") return "scope needs --name";
  return {
    name: text(name, "", 100),
    criticality,
    environment: text(get("environment"), "unknown", 60),
    architectureVersion: text(get("version"), "unversioned", 60),
    dataClassification: text(get("data"), "not stated", 100),
    evidenceWindowDays: window,
    owner: text(get("owner"), "", 80),
    stakeholders: list2(get("stakeholders")).map((s) => text(s, "", 60)),
    dependencies: [],
    constraints: list2(get("constraints")).map((s) => text(s, "", 100)),
    knownUnknowns: []
  };
}
function readJson(root, path) {
  const target = isAbsolute4(path) ? path : resolve5(root, path);
  if (!isInside(root, target)) return { ok: false, error: `${path} is outside the project` };
  const read = readTextBounded(target, 4e6);
  if (read.kind !== "ok") return { ok: false, error: `${path} could not be read (${read.kind})` };
  try {
    return { ok: true, value: JSON.parse(read.text) };
  } catch {
    return { ok: false, error: `${path} is not valid JSON` };
  }
}
var ANSWERS = ["yes", "partly", "no", "not-applicable"];
function parseAnswers(value) {
  const list3 = isRecord6(value) ? value["answers"] : null;
  if (!Array.isArray(list3) || list3.length > 500)
    return { ok: false, error: 'the answers file must be {"answers": [...]}' };
  const known = new Set(QUESTIONS.map((q2) => q2.id));
  const answers = [];
  const unknown = [];
  for (const a of list3) {
    if (!isRecord6(a) || typeof a["questionId"] !== "string" || typeof a["answer"] !== "string" || !ANSWERS.includes(a["answer"]))
      return {
        ok: false,
        error: `each answer needs questionId and answer (${ANSWERS.join(", ")})`
      };
    if (!known.has(a["questionId"])) {
      unknown.push(a["questionId"].slice(0, 60));
      continue;
    }
    answers.push({
      questionId: a["questionId"],
      answer: a["answer"],
      ...typeof a["note"] === "string" ? { note: a["note"].slice(0, 400) } : {},
      ...typeof a["answeredBy"] === "string" ? { answeredBy: a["answeredBy"].slice(0, 80) } : {},
      ...typeof a["answeredAt"] === "string" ? { answeredAt: a["answeredAt"].slice(0, 30) } : {}
    });
  }
  return { ok: true, answers, unknown };
}
function runCli(argv, deps) {
  return Promise.resolve(run(argv, deps));
}
function run(argv, deps) {
  const words = [];
  const options = /* @__PURE__ */ new Map();
  const flags = /* @__PURE__ */ new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (FLAGS.includes(name)) flags.add(name);
    else if (VALUED.includes(name)) {
      const value = argv[i + 1];
      if (value === void 0) return usageError(`--${name} needs a value`);
      options.set(name, [...options.get(name) ?? [], value]);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = flags.has("json");
  const one = (n) => options.get(n)?.[0];
  const [command, a, b, extra] = words;
  if (extra !== void 0) return usageError("too many arguments");
  const now = deps.now ?? /* @__PURE__ */ new Date();
  const print = (value, body) => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : body
  });
  const save = (rel, content) => {
    const r = writeNew(deps.root, rel, content);
    return r.ok ? `Created ${r.file}` : `Not written: ${r.error}`;
  };
  if (command === "scope") {
    const scope = makeScope(options);
    return typeof scope === "string" ? usageError(scope) : { exitCode: 0, stdout: JSON.stringify(scope, null, 2) };
  }
  if (command === "evidence-template") {
    const needing = QUESTIONS.filter((q2) => q2.evaluate === void 0);
    const template = {
      answers: needing.map((q2) => ({
        questionId: q2.id,
        answer: "",
        note: "",
        answeredBy: "",
        answeredAt: "",
        _question: q2.text
      })),
      _help: 'answer is one of "yes", "partly", "no", "not-applicable". Leave a question out if you do not know: it will be listed as missing evidence, never as met.'
    };
    return { exitCode: 0, stdout: JSON.stringify(template, null, 2) };
  }
  if (command === "review") {
    let scope;
    const scopeFile = one("scope");
    if (scopeFile === void 0)
      scope = makeScope(/* @__PURE__ */ new Map([["name", ["Unnamed workload"]]]));
    else {
      const f = readJson(deps.root, scopeFile);
      if (!f.ok) return { exitCode: 1, stdout: f.error };
      const m = /* @__PURE__ */ new Map();
      const v = f.value;
      if (!isRecord6(v)) return { exitCode: 1, stdout: `${scopeFile} is not a scope` };
      for (const [k, key] of [
        ["name", "name"],
        ["criticality", "criticality"],
        ["environment", "environment"],
        ["version", "architectureVersion"],
        ["data", "dataClassification"],
        ["owner", "owner"]
      ]) {
        const x = v[key];
        if (typeof x === "string") m.set(k, [x]);
      }
      if (typeof v["evidenceWindowDays"] === "number")
        m.set("window", [String(v["evidenceWindowDays"])]);
      if (Array.isArray(v["stakeholders"]))
        m.set("stakeholders", [
          v["stakeholders"].filter((s) => typeof s === "string").join(",")
        ]);
      if (Array.isArray(v["constraints"]))
        m.set("constraints", [
          v["constraints"].filter((s) => typeof s === "string").join(",")
        ]);
      const made = makeScope(m);
      if (typeof made === "string") return { exitCode: 1, stdout: `${scopeFile}: ${made}` };
      scope = made;
    }
    let answers = [];
    const notes = [];
    const answersFile = one("answers");
    if (answersFile !== void 0) {
      const f = readJson(deps.root, answersFile);
      if (!f.ok) return { exitCode: 1, stdout: f.error };
      const parsed = parseAnswers(f.value);
      if (!parsed.ok) return { exitCode: 1, stdout: `${answersFile}: ${parsed.error}` };
      answers = parsed.answers.filter((x) => x.answer !== "");
      if (parsed.unknown.length > 0)
        notes.push(`Answers for unknown questions were ignored: ${parsed.unknown.join(", ")}`);
    }
    const reports = [];
    for (const file of options.get("report") ?? []) {
      const f = readJson(deps.root, file);
      if (!f.ok) return { exitCode: 1, stdout: f.error };
      const parsed = reportCodec.validate(f.value);
      if (!parsed.ok)
        return { exitCode: 1, stdout: `${file} is not an analysis report (${parsed.error})` };
      reports.push(parsed.value);
    }
    const path = a ?? "cdk.out";
    const loaded = loadStacks(deps.root, path);
    if (loaded.stacks.length === 0)
      notes.push(
        `No templates were read (${loaded.problems.join(" ") || path}); template checks are missing evidence, not passes.`
      );
    else notes.push(...loaded.problems);
    const review = runReview({ scope, stacks: loaded.stacks, answers, reports, now });
    let body = [renderReview(review), ...notes.map((n) => `Note: ${n}`)].join("\n");
    if (flags.has("write")) {
      const base = (one("out") ?? "docs/reviews/well-architected-review").replace(
        /\.(md|json)$/,
        ""
      );
      body += `
${save(`${base}.json`, `${JSON.stringify(review, null, 2)}
`)}
${save(`${base}.md`, `${renderReview(review)}
`)}`;
    }
    return print(review, body);
  }
  if (command === "improve") {
    if (a === void 0) return usageError("improve needs a review.json");
    const f = readJson(deps.root, a);
    if (!f.ok) return { exitCode: 1, stdout: f.error };
    const parsed = parseReview(f.value);
    if (!parsed.ok) return { exitCode: 1, stdout: `${a}: ${parsed.error}` };
    const md = renderImprovementPlan(parsed.review);
    return flags.has("write") ? {
      exitCode: 0,
      stdout: `${md}

${save(`${(one("out") ?? "docs/reviews/improvement-plan").replace(/\.md$/, "")}.md`, `${md}
`)}`
    } : print({ markdown: md }, md);
  }
  if (command === "compare") {
    if (a === void 0 || b === void 0) return usageError("compare needs two review files");
    const x = readJson(deps.root, a);
    const y = readJson(deps.root, b);
    if (!x.ok) return { exitCode: 1, stdout: x.error };
    if (!y.ok) return { exitCode: 1, stdout: y.error };
    const before = parseReview(x.value);
    const after = parseReview(y.value);
    if (!before.ok) return { exitCode: 1, stdout: `${a}: ${before.error}` };
    if (!after.ok) return { exitCode: 1, stdout: `${b}: ${after.error}` };
    const c = compareReviews(before.review, after.review);
    return print(c, renderComparison(c, before.review, after.review));
  }
  return usageError(command === void 0 ? "a command is required" : `unknown command ${command}`);
}

// src/entries/cli.ts
try {
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const result = await runCli(process.argv.slice(2), { root });
  process.stdout.write(`${result.stdout}
`);
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(
    `aws-well-architected failed (${error instanceof Error ? error.name : "UnknownError"}).
`
  );
  process.exitCode = 1;
}
