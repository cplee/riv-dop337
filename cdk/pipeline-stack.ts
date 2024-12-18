import { CfnOutput, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
} from 'aws-cdk-lib/pipelines';
import { EcsServiceStack } from './ecs-service-stack';

class ApplicationStage extends Stage {
  public readonly loadBalancerURL: CfnOutput;

  constructor(scope: Construct, id: string, props?: StageProps) {
    super(scope, id, props);
    const service = new EcsServiceStack(this, 'EcsService');
    this.loadBalancerURL = service.loadBalancerURL;
  }
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'EcsServicePipeline',
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection('cplee/riv-dop337', 'main', {
          connectionArn: 'arn:aws:codeconnections:us-east-1:464380571579:connection/b02de033-3e86-4ce0-bfd9-1b46e14431e7',
          triggerOnPush: true,
        }),
        commands: [
          'yarn install',
          'yarn build',
          'yarn test',
          'yarn cdk:synth'
        ],
      }),
      crossAccountKeys: true,
    });

    // Gamma Wave
    const gammaWave = pipeline.addWave('Gamma', {
      pre: [
        new ShellStep('SAST-Scan', {
          commands: [
            'pip install semgrep',
            'semgrep scan --config auto'
          ]
        }),
        new ShellStep('SCA-Scan', {
          commands: [
            'curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin',
            'grype .'
          ]
        }),
        new ShellStep('SBOM-Generate', {
          commands: [
            'curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin',
            'syft . -o json > sbom.json'
          ]
        }),
        new ShellStep('Secrets-Scan', {
          commands: [
            'curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz | tar -xvzf - -C /usr/local/bin gitleaks',
            'gitleaks detect --source . --no-git -v'
          ]
        })
      ],
    });
    
    // Gamma US East 1
    const gammaUsEast1 = new ApplicationStage(this, 'GammaUsEast1', {
      env: { account: '464380571579', region: 'us-east-1' }
    });
    pipeline.addStage(gammaUsEast1, {
      post: [
        new ShellStep('E2E-Tests', {
          envFromCfnOutputs: {
            URL: gammaUsEast1.loadBalancerURL
          },
          commands: [
            'yarn install',
            'npx playwright install --with-deps',
            'npx playwright test'
          ]
        })
      ]
    });
    
    // Gamma US West 2
    const gammaUsWest2 = new ApplicationStage(this, 'GammaUsWest2', {
      env: { account: '464380571579', region: 'us-west-2' }
    });
    gammaWave.addStage(gammaUsWest2, {
      post: [
        new ShellStep('E2E-Tests', {
          envFromCfnOutputs: {
            URL: gammaUsWest2.loadBalancerURL
          },
          commands: [
            'yarn install',
            'npx playwright install --with-deps',
            'npx playwright test'
          ]
        })
      ]
    });

    // Production Wave
    const prodWave = pipeline.addWave('Production');
    
    // Prod US East 2
    prodWave.addStage(new ApplicationStage(this, 'ProdUsEast2', {
      env: { account: '464380571579', region: 'us-east-2' }
    }));

    // Prod EU West 1
    prodWave.addStage(new ApplicationStage(this, 'ProdEuWest1', {
      env: { account: '464380571579', region: 'eu-west-1' }
    }));
  }
}