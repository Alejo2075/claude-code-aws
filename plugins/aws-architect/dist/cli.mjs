import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/lib/cli.ts
import { isAbsolute as isAbsolute3, resolve as resolve3 } from "node:path";

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

// ../../../packages/template-analysis/src/node.ts
import { readdirSync, statSync } from "node:fs";
import { basename as basename2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from "node:path";

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

// ../../../packages/template-analysis/src/graph.ts
var PSEUDO = /^AWS::/;
var SUB_VARIABLE = /\$\{([A-Za-z0-9:._-]+)\}/g;
function referencesIn(value, depth = 0, found = []) {
  if (depth > 40 || value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) referencesIn(item, depth + 1, found);
    return found;
  }
  const record = value;
  for (const [key, inner] of Object.entries(record)) {
    if (key === "Ref" && typeof inner === "string" && !PSEUDO.test(inner)) {
      found.push([inner, "ref"]);
    } else if (key === "Fn::GetAtt") {
      const target = Array.isArray(inner) ? inner[0] : typeof inner === "string" ? inner.split(".")[0] : void 0;
      if (typeof target === "string") found.push([target, "getatt"]);
    } else if (key === "Fn::Sub") {
      const text2 = Array.isArray(inner) ? inner[0] : inner;
      const locals = Array.isArray(inner) && typeof inner[1] === "object" && inner[1] !== null ? new Set(Object.keys(inner[1])) : /* @__PURE__ */ new Set();
      if (typeof text2 === "string") {
        for (const match of text2.matchAll(SUB_VARIABLE)) {
          const name = (match[1] ?? "").split(".")[0] ?? "";
          if (name !== "" && !PSEUDO.test(name) && !locals.has(name)) found.push([name, "sub"]);
        }
      }
      if (Array.isArray(inner)) referencesIn(inner[1], depth + 1, found);
    } else {
      referencesIn(inner, depth + 1, found);
    }
  }
  return found;
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
  const list2 = Array.isArray(raw) ? raw : raw === void 0 ? [] : [raw];
  const out = [];
  list2.forEach((entry, index) => {
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

// ../../../packages/safe-output/src/redact.ts
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

// src/lib/adr.ts
import { mkdirSync, openSync as openSync2, closeSync as closeSync2, readdirSync as readdirSync2, writeSync } from "node:fs";
import { join as join3 } from "node:path";
var ADR_DIR = "docs/adr";
var MAX = 4e3;
var clean = (text2, max = MAX) => sanitizeText(text2, true).trim().slice(0, max);
function slugOf(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug === "" ? "decision" : slug;
}
function nextNumber(existing) {
  let highest = 0;
  for (const name of existing) {
    const match = /^(\d{4})-/.exec(name);
    if (match !== null) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}
function renderAdr(input, number, date) {
  const options = input.options.map((o) => clean(o, 200)).filter((o) => o !== "");
  return [
    `# ${String(number).padStart(4, "0")}. ${clean(input.title, 120)}`,
    "",
    `- Status: ${input.status}`,
    `- Date: ${date}`,
    "",
    "## Context",
    "",
    clean(input.context) || "_Not stated._",
    "",
    ...options.length > 0 ? ["## Options considered", "", ...options.map((o) => `- ${o}`), ""] : [],
    "## Decision",
    "",
    clean(input.decision) || "_Not stated._",
    "",
    "## Consequences",
    "",
    clean(input.consequences) || "_Not stated._",
    ""
  ].join("\n");
}
function writeAdr(root, input, date) {
  const dir = join3(root, ADR_DIR);
  mkdirSync(dir, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const number = nextNumber(readdirSync2(dir)) + attempt;
    const name = `${String(number).padStart(4, "0")}-${slugOf(input.title)}.md`;
    try {
      const fd = openSync2(join3(dir, name), "wx");
      try {
        writeSync(fd, renderAdr(input, number, date));
      } finally {
        closeSync2(fd);
      }
      return { ok: true, file: `${ADR_DIR}/${name}` };
    } catch (error) {
      if (error.code !== "EEXIST")
        return { ok: false, error: "the record could not be written" };
    }
  }
  return { ok: false, error: "no free record number was found" };
}

// ../../../packages/architecture-graph/src/mermaid.ts
var text = (value, max = 60) => (
  // Quotes, brackets, angle brackets, and line breaks would end the label or inject markup.
  Array.from(value, (ch) => /["\n\r<>[\]{}|`]/.test(ch) ? " " : ch).join("").replace(/\s+/g, " ").trim().slice(0, max)
);
function hash(value) {
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619) >>> 0;
  return h.toString(36);
}
function trimUnderscores(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}
function mermaidIds(ids) {
  const out = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  for (const id of [...ids].sort()) {
    const slug = trimUnderscores(id.replace(/[^A-Za-z0-9]+/g, "_")).slice(0, 40) || "n";
    let candidate = `n_${slug}`;
    if (used.has(candidate)) candidate = `${candidate}_${hash(id)}`;
    used.add(candidate);
    out.set(id, candidate);
  }
  return out;
}
var NODE_STYLE = {
  intended: "stroke-dasharray: 5 3",
  declared: "",
  deployed: "stroke-width:2px",
  observed: "stroke-width:3px",
  inferred: "stroke-dasharray: 2 2"
};
function toMermaid(graph, options = {}) {
  const ids = mermaidIds(graph.nodes.map((n) => n.id));
  const lines = [`flowchart ${options.direction ?? "LR"}`];
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const draw = (indent, node) => {
    lines.push(`${indent}${ids.get(node.id)}["${text(node.kind)}: ${text(node.label)}"]`);
  };
  const grouped = options.groups !== false;
  const groups = [
    ...new Set(nodes.flatMap((n) => n.group === void 0 ? [] : [n.group]))
  ].sort();
  if (grouped)
    for (const group of groups) {
      lines.push(`  subgraph g_${hash(group)}["${text(group)}"]`);
      for (const node of nodes) if (node.group === group) draw("    ", node);
      lines.push("  end");
    }
  for (const node of nodes) if (!grouped || node.group === void 0) draw("  ", node);
  const edges = [...graph.edges].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.label.localeCompare(b.label)
  );
  for (const edge of edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (from === void 0 || to === void 0) continue;
    const label = text(edge.label);
    const tag = edge.basis === "declared" || edge.basis === "deployed" ? "" : ` (${edge.basis})`;
    const caption = `${label}${tag}`.trim();
    const arrow = edge.basis === "inferred" || edge.basis === "intended" ? "-.->" : edge.basis === "observed" ? "==>" : "-->";
    lines.push(
      caption === "" ? `  ${from} ${arrow} ${to}` : `  ${from} ${arrow}|"${caption}"| ${to}`
    );
  }
  for (const node of nodes) {
    const style = NODE_STYLE[node.basis];
    if (style !== "") lines.push(`  style ${ids.get(node.id)} ${style}`);
  }
  if (options.classes !== void 0) {
    lines.push(
      "  classDef added fill:#d4f5d4,stroke:#2a7a2a",
      "  classDef removed fill:#f9d6d6,stroke:#a02020",
      "  classDef changed fill:#fdf0c4,stroke:#9a7b00"
    );
    for (const node of nodes) {
      const cls = options.classes.get(node.id);
      if (cls !== void 0) lines.push(`  class ${ids.get(node.id)} ${cls}`);
    }
  }
  return lines.join("\n");
}

// ../../../packages/architecture-graph/src/model.ts
var emptyGraph = (title) => ({
  schemaVersion: "1",
  title,
  nodes: [],
  edges: [],
  notes: []
});

// ../../../packages/architecture-graph/src/sources.ts
var SHOWN = {
  "AWS::Lambda::Function": "function",
  "AWS::SQS::Queue": "queue",
  "AWS::SNS::Topic": "topic",
  "AWS::DynamoDB::Table": "table",
  "AWS::S3::Bucket": "bucket",
  "AWS::ApiGatewayV2::Api": "http-api",
  "AWS::ApiGateway::RestApi": "rest-api",
  "AWS::StepFunctions::StateMachine": "state-machine",
  "AWS::Events::Rule": "rule",
  "AWS::Events::EventBus": "bus",
  "AWS::Cognito::UserPool": "user-pool",
  "AWS::SecretsManager::Secret": "secret",
  "AWS::KMS::Key": "key",
  "AWS::Kinesis::Stream": "stream",
  "AWS::CloudFront::Distribution": "distribution",
  "AWS::AppSync::GraphQLApi": "graphql-api",
  "AWS::KinesisFirehose::DeliveryStream": "delivery-stream",
  "AWS::ECS::Service": "ecs-service",
  "AWS::SES::EmailIdentity": "email-identity"
};
var first = (value) => referencesIn(value)[0]?.[0] ?? null;
var allRefs = (value) => [...new Set(referencesIn(value).map(([id]) => id))];
var isRecord4 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var textOf = (value, fallback) => typeof value === "string" ? value : fallback;
function fromTemplate(template, group, prefix = "") {
  const resources = template.resources;
  const graph = emptyGraph("Architecture");
  const shown = (id) => id !== null && resources[id] !== void 0 && SHOWN[resources[id].type] !== void 0;
  const add = (from, to, label, basis) => {
    if (from === null || to === null || from === to || !shown(from) || !shown(to)) return;
    if (!graph.edges.some(
      (e) => e.from === prefix + from && e.to === prefix + to && e.label === label
    )) {
      const edge = { from: prefix + from, to: prefix + to, label, basis };
      graph.edges.push(edge);
    }
  };
  const ofType = (...types) => Object.values(resources).filter((r) => types.includes(r.type));
  for (const queue of ofType("AWS::SQS::Queue")) {
    const redrive = queue.properties["RedrivePolicy"];
    if (isRecord4(redrive))
      add(queue.logicalId, first(redrive["deadLetterTargetArn"]), "dead-letter", "declared");
  }
  for (const m of ofType("AWS::Lambda::EventSourceMapping"))
    add(
      first(m.properties["EventSourceArn"]),
      first(m.properties["FunctionName"]),
      "event source",
      "declared"
    );
  for (const custom of ofType("Custom::S3BucketNotifications")) {
    const bucket = first(custom.properties["BucketName"]);
    const config = custom.properties["NotificationConfiguration"];
    if (!isRecord4(config)) continue;
    for (const key of [
      "QueueConfigurations",
      "TopicConfigurations",
      "LambdaFunctionConfigurations"
    ]) {
      const list2 = config[key];
      if (Array.isArray(list2))
        for (const entry of list2)
          add(
            bucket,
            first(
              isRecord4(entry) ? entry["QueueArn"] ?? entry["TopicArn"] ?? entry["LambdaFunctionArn"] : null
            ),
            "object event",
            "declared"
          );
    }
  }
  for (const s of ofType("AWS::SNS::Subscription"))
    add(
      first(s.properties["TopicArn"]),
      first(s.properties["Endpoint"]),
      "subscription",
      "declared"
    );
  for (const rule of ofType("AWS::Events::Rule")) {
    const targets = rule.properties["Targets"];
    if (Array.isArray(targets))
      for (const t of targets)
        add(rule.logicalId, first(isRecord4(t) ? t["Arn"] : null), "rule target", "declared");
  }
  const integrationTarget = /* @__PURE__ */ new Map();
  for (const i of ofType("AWS::ApiGatewayV2::Integration"))
    integrationTarget.set(i.logicalId, first(i.properties["IntegrationUri"]));
  for (const route of ofType("AWS::ApiGatewayV2::Route")) {
    const integration = allRefs(route.properties["Target"]).find((id) => integrationTarget.has(id));
    if (integration !== void 0)
      add(
        first(route.properties["ApiId"]),
        integrationTarget.get(integration) ?? null,
        textOf(route.properties["RouteKey"], "route"),
        "declared"
      );
  }
  for (const method of ofType("AWS::ApiGateway::Method")) {
    const integration = method.properties["Integration"];
    add(
      first(method.properties["RestApiId"]),
      isRecord4(integration) ? first(integration["Uri"]) : null,
      textOf(method.properties["HttpMethod"], "method"),
      "declared"
    );
  }
  for (const dist of ofType("AWS::CloudFront::Distribution")) {
    const config = dist.properties["DistributionConfig"];
    const origins = isRecord4(config) ? config["Origins"] : null;
    if (Array.isArray(origins))
      for (const o of origins)
        add(dist.logicalId, first(isRecord4(o) ? o["DomainName"] : null), "origin", "declared");
  }
  const rolePolicies = /* @__PURE__ */ new Map();
  for (const policy of ofType("AWS::IAM::Policy", "AWS::IAM::ManagedPolicy")) {
    const targets = allRefs(policy.properties["PolicyDocument"]).filter(shown);
    for (const role of allRefs(policy.properties["Roles"]))
      rolePolicies.set(role, [...rolePolicies.get(role) ?? [], ...targets]);
  }
  for (const fn of ofType("AWS::Lambda::Function")) {
    for (const id of allRefs(fn.properties["Environment"]))
      add(fn.logicalId, id, "environment reference", "inferred");
    for (const role of allRefs(fn.properties["Role"]))
      for (const id of rolePolicies.get(role) ?? [])
        add(fn.logicalId, id, "permitted by IAM", "inferred");
  }
  const used = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  graph.nodes = Object.values(resources).filter(
    (r) => SHOWN[r.type] !== void 0 && (used.has(prefix + r.logicalId) || ["AWS::Lambda::Function", "AWS::DynamoDB::Table", "AWS::SQS::Queue"].includes(r.type))
  ).map((r) => ({
    id: prefix + r.logicalId,
    kind: SHOWN[r.type] ?? r.type,
    label: r.logicalId.replace(/[0-9A-F]{8}$/, ""),
    basis: "declared",
    ...group === void 0 ? {} : { group }
  }));
  return graph;
}

// src/lib/diagram.ts
var DIAGRAM_DEPRECATION = "Deprecated: diagrams moved to the aws-diagrams plugin (/aws-diagrams:from-cdk). This command keeps working for now.";
function architectureOf(template) {
  const graph = fromTemplate(template);
  return { graph, nodes: graph.nodes, links: graph.edges };
}
function toMermaid2(architecture) {
  return toMermaid(architecture.graph);
}

// src/data/decisions.json
var decisions_default = {
  note: "Short summaries of the guidance in the pages they cite, for choosing between alternatives. They are a starting point and are NOT a substitute for the sources: open the link before relying on a row. Written from the published guidance; not re-verified line by line against the pages on the date of this snapshot.",
  snapshot: "2026-10-31",
  topics: {
    "api-type": {
      title: "HTTP API, REST API, or GraphQL (AppSync)",
      source: "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html",
      options: [
        {
          name: "HTTP API",
          useWhen: [
            "You need a low-cost, low-latency proxy to Lambda or HTTP backends",
            "JWT or OIDC authorization is enough"
          ],
          watchOut: [
            "It lacks API keys and usage plans, request validation, caching, and some WAF and private-endpoint features of REST APIs"
          ]
        },
        {
          name: "REST API",
          useWhen: [
            "You need API keys and usage plans, request validation, response caching, WAF, or private endpoints"
          ],
          watchOut: ["Higher price per request than an HTTP API"]
        },
        {
          name: "GraphQL (AppSync)",
          useWhen: [
            "Clients need to choose their fields, combine several sources in one call, or subscribe to changes"
          ],
          watchOut: [
            "A different operating model: schema design, resolvers, and authorization per field are yours to manage"
          ]
        }
      ],
      askFirst: [
        "Which clients call it and what do they need to authenticate with?",
        "Is per-client throttling or an API key required?"
      ]
    },
    messaging: {
      title: "SQS, SNS, or EventBridge",
      source: "https://docs.aws.amazon.com/decision-guides/latest/sns-or-sqs-or-eventbridge/sns-or-sqs-or-eventbridge.html",
      options: [
        {
          name: "SQS",
          useWhen: [
            "One consumer group must process each message, at its own pace, with retries and a dead-letter queue",
            "You need to buffer bursts and protect a downstream service"
          ],
          watchOut: [
            "Standard queues deliver at least once and possibly out of order: handlers must be idempotent",
            "A visibility timeout shorter than the consumer's processing time causes duplicates"
          ]
        },
        {
          name: "SNS",
          useWhen: [
            "One message must fan out to many subscribers (queues, functions, HTTP endpoints)"
          ],
          watchOut: ["Push delivery: pair each slow subscriber with its own queue"]
        },
        {
          name: "EventBridge",
          useWhen: [
            "Producers and consumers should be decoupled by event content, with routing rules, schema discovery, archive and replay, or SaaS and cross-account events"
          ],
          watchOut: [
            "It is an event router, not a buffer: delivery targets still need retries and a dead-letter queue",
            "Event size and throughput quotas apply"
          ]
        }
      ],
      askFirst: [
        "How many independent consumers need each message?",
        "Does a consumer need to be able to fall behind without losing messages?",
        "Do events need to be routed by their content?"
      ]
    },
    workflow: {
      title: "Step Functions Standard or Express",
      source: "https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html",
      options: [
        {
          name: "Standard",
          useWhen: [
            "Workflows are long-running, need an audit trail of every step, or must not run a step twice"
          ],
          watchOut: ["Priced per state transition: chatty workflows get expensive"]
        },
        {
          name: "Express",
          useWhen: ["Workflows are short and run at high volume, such as event processing"],
          watchOut: [
            "Limited duration, at-least-once semantics for asynchronous executions, and execution history only through logs"
          ]
        }
      ],
      askFirst: [
        "How long can one execution take?",
        "What happens if a step runs twice?",
        "How many executions per second?"
      ]
    },
    integration: {
      title: "Lambda or a direct service integration",
      source: "https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/welcome.html",
      options: [
        {
          name: "Direct integration (API Gateway, EventBridge Pipes, Step Functions SDK integrations)",
          useWhen: ["The step only moves or maps data between services, with no business logic"],
          watchOut: [
            "Mapping templates and error handling are configuration you must test and operate"
          ]
        },
        {
          name: "Lambda",
          useWhen: ["There is logic, validation, or composition that needs code"],
          watchOut: [
            "Every function is code to patch, monitor, and size, and adds a cold start and a timeout to reason about"
          ]
        }
      ],
      askFirst: ["Is there any decision in this step, or only plumbing?"]
    },
    "data-store": {
      title: "DynamoDB or a relational database",
      source: "https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/welcome.html",
      options: [
        {
          name: "DynamoDB",
          useWhen: [
            "Access patterns are known up front, you need predictable single-digit-millisecond access at any scale, and no ad hoc joins"
          ],
          watchOut: [
            "Changing the key schema later usually means a migration; the design follows the queries"
          ]
        },
        {
          name: "Relational (for example Aurora)",
          useWhen: [
            "Queries are varied or ad hoc, you need joins and transactions across entities"
          ],
          watchOut: [
            "Connections, scaling, and cost model differ from DynamoDB; Lambda needs connection management"
          ]
        }
      ],
      askFirst: [
        "List the queries: which are known and which are not?",
        "What consistency and transactions does the business need?"
      ]
    },
    "sync-async": {
      title: "Synchronous or asynchronous",
      source: "https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/welcome.html",
      options: [
        {
          name: "Synchronous",
          useWhen: ["The caller needs the result now and can wait for it"],
          watchOut: [
            "Timeouts and failures propagate to the caller; chains of calls multiply latency"
          ]
        },
        {
          name: "Asynchronous",
          useWhen: ["The caller only needs an acknowledgment and the work can finish later"],
          watchOut: [
            "You must design for duplicates, ordering, retries, dead-letter handling, and how the caller learns the outcome"
          ]
        }
      ],
      askFirst: [
        "What does the caller do with the result?",
        "What is the longest acceptable wait?"
      ]
    }
  }
};

// src/lib/decisions.ts
var topics = decisions_default.topics;
var TOPIC_NAMES = Object.keys(topics);
var DECISIONS_SNAPSHOT = decisions_default.snapshot;
var DECISIONS_NOTE = decisions_default.note;
function getTopic(name) {
  return Object.hasOwn(topics, name) ? topics[name] ?? null : null;
}
function renderTopic(name, topic) {
  const lines = [`${topic.title} (${name})`, `Source: ${topic.source}`, ""];
  for (const option of topic.options) {
    lines.push(option.name);
    for (const line of option.useWhen) lines.push(`  use when: ${line}`);
    for (const line of option.watchOut) lines.push(`  watch out: ${line}`);
  }
  lines.push("", "Ask first:");
  for (const question of topic.askFirst) lines.push(`  - ${question}`);
  lines.push("", `Summary dated ${DECISIONS_SNAPSHOT}; ${DECISIONS_NOTE}`);
  return lines.join("\n");
}
function renderTopicList() {
  return [
    "Decision topics:",
    ...TOPIC_NAMES.map((name) => `  ${name.padEnd(12)} ${topics[name]?.title ?? ""}`)
  ].join("\n");
}

// src/lib/intake.ts
var INTAKE = [
  {
    key: "workload",
    question: "What does the system do, and who or what calls it?",
    why: "Sets the entry points and the trust boundaries."
  },
  {
    key: "peakTraffic",
    question: "What are the expected average and peak requests or events per second?",
    why: "Drives concurrency, quotas, buffering, and cost."
  },
  {
    key: "latency",
    question: "How long may a caller wait for a response?",
    why: "Decides between synchronous and asynchronous designs."
  },
  {
    key: "availability",
    question: "What availability and recovery targets (RTO and RPO) apply?",
    why: "Decides single-region or multi-region and the backup strategy."
  },
  {
    key: "dataClassification",
    question: "What data is stored or passed, and how sensitive is it?",
    why: "Decides encryption, access control, retention, and logging rules."
  },
  {
    key: "accessPatterns",
    question: "Which queries and updates must the data store support?",
    why: "The key design of DynamoDB follows the queries; a relational store needs the joins."
  },
  {
    key: "consistency",
    question: "Where must reads see the latest write, and where is stale data acceptable?",
    why: "Decides consistency settings and the need for transactions."
  },
  {
    key: "failureHandling",
    question: "What should happen to a message or request that keeps failing?",
    why: "Decides retries, dead-letter queues, and who is told."
  },
  {
    key: "compliance",
    question: "Which compliance or data-residency rules apply?",
    why: "Constrains regions, services, and logging."
  },
  {
    key: "budget",
    question: "Is there a monthly budget or a cost ceiling?",
    why: "Constrains always-on components and the data-store billing mode."
  },
  {
    key: "team",
    question: "Which languages and operational skills does the team have?",
    why: "A design the team cannot operate is not a good design."
  }
];
var MAX_ANSWER = 600;
function checkIntake(requirements) {
  const known = new Set(INTAKE.map((question) => question.key));
  const answered = [];
  const missing = [];
  for (const question of INTAKE) {
    const raw = requirements[question.key];
    const answer = typeof raw === "string" ? raw.trim().slice(0, MAX_ANSWER) : "";
    if (answer === "" || /^(tbd|unknown|\?|n\/a|todo)$/i.test(answer)) missing.push(question);
    else answered.push({ key: question.key, answer });
  }
  return {
    answered,
    missing,
    unknownKeys: Object.keys(requirements).filter((key) => !known.has(key)).sort()
  };
}
function renderIntake(result) {
  const lines = [`Requirements: ${result.answered.length} of ${INTAKE.length} answered.`];
  if (result.missing.length > 0) {
    lines.push("", "Still open (a design built without these rests on assumptions):");
    for (const q2 of result.missing)
      lines.push(`  ${q2.key}: ${q2.question}
      Why it matters: ${q2.why}`);
  }
  if (result.unknownKeys.length > 0)
    lines.push("", `Not part of the intake (kept as stated): ${result.unknownKeys.join(", ")}`);
  return lines.join("\n");
}

// src/lib/plan.ts
function initPlan(title, requirements, now) {
  const intake = checkIntake(requirements);
  return {
    schemaVersion: SCHEMA_VERSION,
    title: title.trim().slice(0, 120) || "Untitled plan",
    generatedAt: now.toISOString(),
    requirements: Object.fromEntries(
      [...intake.answered.map((a) => [a.key, a.answer])].concat(
        intake.unknownKeys.map((key) => [key, (requirements[key] ?? "").slice(0, 600)])
      )
    ),
    components: [],
    integrations: [],
    assumptions: intake.missing.map(
      (q2) => `Not stated: ${q2.key}. Assumed nothing; to be confirmed.`
    ),
    risks: [],
    openQuestions: intake.missing.map((q2) => q2.question)
  };
}
function checkPlan(text2) {
  const parsed = planCodec.parse(text2);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const plan = parsed.value;
  const warnings = [];
  const ids = /* @__PURE__ */ new Set();
  for (const component of plan.components) {
    if (ids.has(component.id))
      warnings.push(`Component id "${component.id}" is used more than once.`);
    ids.add(component.id);
  }
  for (const link of plan.integrations) {
    for (const end of [link.from, link.to])
      if (!ids.has(end)) warnings.push(`Integration refers to "${end}", which is not a component.`);
  }
  if (plan.components.length === 0) warnings.push("The plan has no components yet.");
  if (plan.openQuestions.length > 0)
    warnings.push(
      `${plan.openQuestions.length} open question(s) remain; the design rests on assumptions.`
    );
  return { ok: true, plan, warnings };
}
function renderPlan(plan, warnings) {
  const lines = [
    `Plan: ${plan.title} (generated ${plan.generatedAt})`,
    `  ${plan.components.length} component(s), ${plan.integrations.length} integration(s), ${plan.assumptions.length} assumption(s), ${plan.risks.length} risk(s), ${plan.openQuestions.length} open question(s)`
  ];
  for (const warning of warnings) lines.push(`  - ${warning}`);
  return lines.join("\n");
}

// ../../../packages/lens-questions/src/template-questions.ts
var isRecord5 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var ratio = (ok, total) => total === 0 ? "not-in-template" : ok === total ? "yes" : ok === 0 ? "no" : "partly";
var count = (ok, total, what) => total === 0 ? "nothing of this kind in the template" : `${ok} of ${total} ${what}`;
var firstGetAtt = (value) => JSON.stringify(value).match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ?? "";
var firstRef = (value) => JSON.stringify(value).match(/"Ref":"([^"]+)"/)?.[1] ?? "";
var dlq = (t) => {
  const queues = resourcesOfType(t, "AWS::SQS::Queue");
  const targets = new Set(
    queues.flatMap(
      (q2) => isRecord5(q2.properties["RedrivePolicy"]) ? [firstGetAtt(q2.properties["RedrivePolicy"])] : []
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
    (f) => isRecord5(f.properties["TracingConfig"]) && f.properties["TracingConfig"]["Mode"] === "Active"
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
    return isRecord5(cfg) && Object.values(cfg).every((v) => v === true);
  }).length;
  return {
    answer: ratio(ok, buckets.length),
    evidence: count(ok, buckets.length, "buckets block public access")
  };
};
var topicEncryption = (t) => {
  const topics2 = resourcesOfType(t, "AWS::SNS::Topic");
  const ok = topics2.filter((x) => x.properties["KmsMasterKeyId"] !== void 0).length;
  return {
    answer: ratio(ok, topics2.length),
    evidence: count(ok, topics2.length, "topics set a KMS key")
  };
};
var tableBackups = (t) => {
  const tables = resourcesOfType(t, "AWS::DynamoDB::Table");
  const ok = tables.filter((x) => {
    const spec = x.properties["PointInTimeRecoverySpecification"];
    return isRecord5(spec) && spec["PointInTimeRecoveryEnabled"] === true;
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

// src/lib/review.ts
var LEGACY = /* @__PURE__ */ new Set([
  "REL-DLQ",
  "REL-VISIBILITY",
  "REL-IDEMPOTENCY",
  "OPS-TRACING",
  "OPS-ALARMS",
  "OPS-LOG-RETENTION",
  "SEC-AUTHZ",
  "SEC-LEAST-PRIVILEGE",
  "SEC-PUBLIC-EXPOSURE",
  "PERF-MEMORY",
  "COST-ON-DEMAND"
]);
var REVIEW_DEPRECATION = "Deprecated: the Well-Architected style review moved to the aws-well-architected plugin (/aws-well-architected:review), which covers all six pillars with an evidence ledger. This command keeps working for now.";
function review(template, now = /* @__PURE__ */ new Date()) {
  const answered = QUESTIONS.filter((q2) => LEGACY.has(q2.id)).map((q2) => {
    const result = q2.evaluate?.(template, now);
    return {
      id: q2.id,
      pillar: q2.pillar,
      question: q2.text,
      source: q2.source,
      answer: result?.answer ?? "not-in-template",
      evidence: result?.evidence ?? q2.notInTemplate ?? "A template cannot answer this."
    };
  });
  return {
    answered,
    needsOthers: [
      "Sustainability, most of Performance, and the organizational parts of Operational Excellence cannot be answered from a template.",
      "The Serverless Lens has many more questions than these; this is a subset that a template can speak to. Run the full review with your team.",
      REVIEW_DEPRECATION
    ]
  };
}

// src/lib/cli.ts
var USAGE = `Usage: aws-architect <command> [options]

  diagram [path] [--stack name]        DEPRECATED, use aws-diagrams: Mermaid diagram of cdk.out or a template
  review [path]                        Well-Architected style questions a template can answer, with evidence
  decisions [topic]                    Decision tables with sources (${TOPIC_NAMES.join(", ")})
  intake --requirements '<json>'       Which requirement questions are still open
  plan init --title <t> [--requirements '<json>']   A starting architecture plan (JSON)
  plan check <file>                    Validate a plan file
  adr --title <t> --decision <d> [--context <c>] [--consequences <c>] [--option <o>]... [--status s] [--write]
                                       Draft an ADR; written to docs/adr only with --write

Options: --json

Nothing here calls AWS or changes the project, except adr --write, which creates a new file and never overwrites one.`;
var usageError = (message) => ({
  exitCode: 2,
  stdout: `${message}

${USAGE}`
});
var FLAGS = ["json", "write"];
var VALUED = [
  "stack",
  "requirements",
  "title",
  "decision",
  "context",
  "consequences",
  "option",
  "status",
  "file"
];
var MAX_JSON = 2e4;
function runCli(argv, deps) {
  return Promise.resolve(run(argv, deps));
}
function requirementsOf(text2) {
  if (text2.length > MAX_JSON) return null;
  try {
    const value = JSON.parse(text2);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const out = {};
    for (const [key, answer] of Object.entries(value)) {
      if (typeof answer !== "string") return null;
      out[key.slice(0, 60)] = answer;
    }
    return out;
  } catch {
    return null;
  }
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
  const one = (name) => options.get(name)?.[0];
  const [command, sub, third] = words;
  const now = deps.now ?? /* @__PURE__ */ new Date();
  const print = (value, text2) => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text2
  });
  if (command === "diagram" || command === "review") {
    if (sub !== void 0 && third !== void 0) return usageError("too many arguments");
    const loaded = loadStacks(deps.root, sub ?? "cdk.out");
    if (loaded.stacks.length === 0)
      return { exitCode: 1, stdout: loaded.problems.join("\n") || "No templates were found." };
    const wanted = one("stack");
    const stacks = wanted === void 0 ? loaded.stacks : loaded.stacks.filter((s) => s.name === wanted);
    if (stacks.length === 0) return usageError(`no stack named ${wanted ?? ""}`);
    const notes = loaded.problems.map((problem) => `Note: ${problem}`);
    if (command === "diagram") {
      const parts = stacks.map((stack) => ({
        stack: stack.name,
        architecture: architectureOf(stack.template)
      }));
      const text3 = parts.map(
        (part) => `Stack ${part.stack}

\`\`\`mermaid
${toMermaid2(part.architecture)}
\`\`\`

Solid arrows are written in the template. Dotted arrows are inferred from permissions or environment variables: they show a function can reach a resource, not that it does.`
      ).concat(notes, DIAGRAM_DEPRECATION).join("\n\n");
      return print(
        {
          schemaVersion: "1",
          deprecated: DIAGRAM_DEPRECATION,
          stacks: parts,
          problems: loaded.problems
        },
        text3
      );
    }
    const reviews = stacks.map((stack) => ({ stack: stack.name, ...review(stack.template) }));
    const text2 = reviews.map(
      (r) => [
        `Stack ${r.stack}`,
        ...r.answered.map(
          (a) => `  [${a.answer.toUpperCase()}] ${a.id} (${a.pillar}) ${a.question}
      ${a.evidence}
      ${a.source}`
        ),
        ...r.needsOthers.map((line) => `  Not covered: ${line}`)
      ].join("\n")
    ).concat(notes).join("\n\n");
    return print({ schemaVersion: "1", reviews, problems: loaded.problems }, text2);
  }
  if (command === "decisions") {
    if (third !== void 0) return usageError("too many arguments");
    if (sub === void 0) return print({ topics: TOPIC_NAMES }, renderTopicList());
    const topic = getTopic(sub);
    if (topic === null) return usageError(`unknown topic ${sub}`);
    return print({ topic: sub, ...topic }, renderTopic(sub, topic));
  }
  if (command === "intake") {
    const raw = one("requirements");
    const requirements = raw === void 0 ? {} : requirementsOf(raw);
    if (requirements === null) return usageError("--requirements must be a JSON object of strings");
    const result = checkIntake(requirements);
    return print(result, renderIntake(result));
  }
  if (command === "plan") {
    if (sub === "init") {
      const title = one("title");
      if (title === void 0) return usageError("plan init needs --title");
      const raw = one("requirements");
      const requirements = raw === void 0 ? {} : requirementsOf(raw);
      if (requirements === null)
        return usageError("--requirements must be a JSON object of strings");
      const plan = initPlan(title, requirements, now);
      return { exitCode: 0, stdout: JSON.stringify(plan, null, 2) };
    }
    if (sub === "check") {
      if (third === void 0) return usageError("plan check needs a file");
      const path = isAbsolute3(third) ? third : resolve3(deps.root, third);
      if (!isInside(deps.root, path)) return usageError("the plan file must be inside the project");
      const read = readTextBounded(path, 1e6);
      if (read.kind !== "ok")
        return { exitCode: 1, stdout: `${third} could not be read (${read.kind}).` };
      const checked = checkPlan(read.text);
      if (!checked.ok) return { exitCode: 1, stdout: `Not a valid plan: ${checked.error}` };
      return print(checked, renderPlan(checked.plan, checked.warnings));
    }
    return usageError("plan needs init or check");
  }
  if (command === "adr") {
    const title = one("title");
    const decision = one("decision");
    if (title === void 0 || decision === void 0)
      return usageError("adr needs --title and --decision");
    const status = one("status") ?? "proposed";
    if (status !== "proposed" && status !== "accepted" && status !== "superseded")
      return usageError("--status must be proposed, accepted, or superseded");
    const input = {
      title,
      status,
      decision,
      context: one("context") ?? "",
      consequences: one("consequences") ?? "",
      options: options.get("option") ?? []
    };
    const date = now.toISOString().slice(0, 10);
    if (!flags.has("write")) {
      const text2 = renderAdr(input, 0, date);
      return print(
        { written: false },
        `${text2}
(Draft only; add --write to create the file under docs/adr.)`
      );
    }
    const written = writeAdr(deps.root, input, date);
    return written.ok ? print({ written: true, file: written.file }, `Created ${written.file}`) : { exitCode: 1, stdout: `Not written: ${written.error}.` };
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
    `aws-architect failed (${error instanceof Error ? error.name : "UnknownError"}).
`
  );
  process.exitCode = 1;
}
