# Regenerating `src/data/replacement.json`

The file lists, per CloudFormation resource type, the properties the resource provider schema marks
`createOnlyProperties` (changing one replaces the resource). Regenerate it when AWS adds services:

1. Download `https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip` and unzip it.
2. For each `aws-<service>-<type>.json` of the supported services, take `typeName`, `createOnlyProperties`
   (strip the `/properties/` prefix), and `primaryIdentifier`.
3. Write them under `types`, keep the `supplement` section, and update `retrieved`.

The supported services are listed in `src/catalog.ts`. The data is a snapshot: it is dated and never
fetched at run time.
