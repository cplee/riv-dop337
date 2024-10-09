import { Arn, Stack, StackProps } from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { RecipeApplication } from './ecs-service-stack';

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // CodeConnection ARN to use for GitHub source stage
    const connectionArn = Arn.format({
      resource: 'connection',
      resourceName: '666d8617-b30d-4bf3-afaf-9c4daf19df15',
      service: 'codeconnections',
    }, Stack.of(this));

    // Define the pipeline
    const pipeline = new CodePipeline(this, 'NestRecipesAppPipeline', {
      pipelineName: 'NestRecipesAppPipeline',
      synth: new ShellStep('SynthStep', { 
        input: CodePipelineSource.connection(
          'cplee/riv-dop337',
          'main', 
          { connectionArn }),
        installCommands: [ 
          'yarn install'
        ],
        commands: [
          'yarn lint',        // Run linting
          'yarn test',        // Run unit tests
          'yarn cdk:synth',    // Synthesize CDK app        ],
        ],
      }),
    });

    // Add the production deployment wave with stages for us-east-1 and us-west-2
    const prod = pipeline.addWave('Prod');
    prod.addStage(new RecipeApplication(this, 'us-east-1', {
      env: {
        account: '314716890391',
        region: 'us-east-1',
      }
    }));
    prod.addStage(new RecipeApplication(this, 'us-west-2', {
      env: {
        account: '314716890391',
        region: 'us-west-2',
      }
    }));
  }
}