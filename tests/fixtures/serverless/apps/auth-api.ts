// Fixture: HTTP API with a Cognito JWT authorizer. "/health" is public on purpose; "/admin" has no authorizer
// when VARIANT=missing-auth, to exercise the authorization-coverage check.
import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";

const variant = process.env["VARIANT"] ?? "v1";
const app = new cdk.App();
const stack = new cdk.Stack(app, "AuthApiStack");
const pool = new cognito.UserPool(stack, "Users", { selfSignUpEnabled: false, removalPolicy: cdk.RemovalPolicy.RETAIN });
const client = pool.addClient("WebClient", { authFlows: { userSrp: true } });
const fn = new lambda.Function(stack, "ApiHandler", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "index.handler",
  code: lambda.Code.fromInline("exports.handler = async () => ({ statusCode: 200, body: 'ok' });"),
  timeout: cdk.Duration.seconds(10),
});
const authorizer = new authorizers.HttpUserPoolAuthorizer("PoolAuthorizer", pool, { userPoolClients: [client] });
const api = new apigw.HttpApi(stack, "Api", { corsPreflight: { allowOrigins: variant === "open-cors" ? ["*"] : ["https://app.example.com"], allowMethods: [apigw.CorsHttpMethod.GET] } });
const integration = new integrations.HttpLambdaIntegration("Integration", fn);
api.addRoutes({ path: "/orders", methods: [apigw.HttpMethod.GET], integration, authorizer });
api.addRoutes({ path: "/health", methods: [apigw.HttpMethod.GET], integration });
api.addRoutes({ path: "/admin", methods: [apigw.HttpMethod.POST], integration, ...(variant === "missing-auth" ? {} : { authorizer }) });
