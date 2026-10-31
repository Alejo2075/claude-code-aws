# Serverless fixtures

Real CDK v2 TypeScript apps and the CloudFormation templates they synthesize, used by the tests of
`template-analysis` and of the serverless plugins. They are committed so CI never runs `cdk`.

| Template                                       | App                  | Used for                                                          |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| `orders.v1`                                    | `queue-lambda-ddb`   | Baseline: queue + DLQ -> Lambda -> DynamoDB, tracing, log group   |
| `orders.v2-renamed-table`                      | same, `VARIANT=v2`   | A construct id change: the table is deleted and created           |
| `orders.v3-new-key`                            | same, `VARIANT=v3`   | A partition key change on a stateful table                        |
| `auth-api.v1`                                  | `auth-api`           | HTTP API, Cognito JWT authorizer, one intentionally public route  |
| `auth-api.missing-auth`                        | same                 | A sensitive route without an authorizer                           |
| `auth-api.open-cors`                           | same                 | CORS allowing every origin                                        |
| `s3-ingest.v1`                                 | `s3-ingest`          | S3 -> SQS -> Lambda ingestion with a DLQ                          |
| `flawed.v1`                                    | `flawed`             | Wildcard IAM, public bucket policy, plain queue, public URL, ...  |
| `cdk.out.orders/`                              | `queue-lambda-ddb`   | A complete `cdk.out` directory (manifest + template)              |

## Regenerating

They were produced with `aws-cdk-lib` 2.230.0 and `aws-cdk` 2.1030.0 in a scratch project, with
`--no-version-reporting --no-path-metadata --no-asset-metadata` so the output is stable:

```sh
npm install aws-cdk-lib constructs aws-cdk tsx typescript
VARIANT=v1 npx cdk synth --app "npx tsx apps/queue-lambda-ddb.ts" --output cdk.out \
  --no-version-reporting --no-path-metadata --no-asset-metadata --quiet
```

The apps are not compiled by this repository (they import `aws-cdk-lib`, which is not a dependency
here) and are excluded from type checking and linting. Asset hashes differ between CDK versions, so
the templates are inputs to tests, not outputs to diff.
