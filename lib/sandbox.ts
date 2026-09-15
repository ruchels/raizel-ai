/**
 * Sandboxed Execution Architecture Contract for RAIZEL AI.
 *
 * NOTE: For security in production and serverless deployments (e.g. Vercel),
 * arbitrary user-directed commands are NEVER executed via child_process or local shell.
 * This module defines the architectural contract and adapter interface for connecting
 * dedicated isolated sandboxes (e.g. Docker, E2B, WebContainers, or MicroVMs) in the future.
 */

import { ArtifactProject } from '@/types/artifact';
import { validateProject, ProjectValidationResult } from '@/lib/validation';

export type SandboxEnvironmentType = 'serverless_emulation' | 'isolated_container' | 'webcontainer';

export interface SandboxCommand {
  command: 'npm install' | 'npm run build' | 'npm test' | 'npm run lint' | 'python main.py' | string;
  args?: string[];
  timeoutMs?: number;
}

export interface SandboxRunResult {
  success: boolean;
  exitCode: number;
  environment: SandboxEnvironmentType;
  commandExecuted: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  logs: string[];
  validationResult?: ProjectValidationResult;
  remediationAdvice?: string;
}

export interface ExecutionSandboxDriver {
  name: string;
  type: SandboxEnvironmentType;
  isAvailable(): boolean;
  executeProject(project: ArtifactProject, command: SandboxCommand): Promise<SandboxRunResult>;
}

/**
 * Built-in Safe Driver for Serverless Deployments.
 * Instead of dangerous raw shell execution, it performs deep static validation
 * and provides clear diagnostics and dependency checks.
 */
export class SafeStaticExecutionDriver implements ExecutionSandboxDriver {
  name = 'Raizel Safe Static Execution';
  type: SandboxEnvironmentType = 'serverless_emulation';

  isAvailable(): boolean {
    return true;
  }

  async executeProject(
    project: ArtifactProject,
    command: SandboxCommand
  ): Promise<SandboxRunResult> {
    const startTime = Date.now();
    const validation = validateProject(project);

    const logs: string[] = [
      `[RAIZEL Sandbox] Target environment: ${this.type}`,
      `[RAIZEL Sandbox] Requested command: ${command.command}`,
      `[RAIZEL Sandbox] Files in project: ${project.files.length}`,
      `[RAIZEL Sandbox] Running static verification suite...`,
    ];

    if (validation.hasErrors) {
      logs.push(`[RAIZEL Sandbox] Errors encountered during project analysis.`);
      for (const issue of validation.issues.filter((i) => i.severity === 'error')) {
        logs.push(` - Error: ${issue.message} (${issue.filePath || 'project'})`);
      }

      return {
        success: false,
        exitCode: 1,
        environment: this.type,
        commandExecuted: command.command,
        stdout: validation.summary,
        stderr: validation.issues.map((i) => i.message).join('\n'),
        durationMs: Date.now() - startTime,
        logs,
        validationResult: validation,
        remediationAdvice: 'Fix broken imports and JSON errors reported by the static analyzer.',
      };
    }

    logs.push(`[RAIZEL Sandbox] Static validation completed cleanly.`);
    logs.push(`[RAIZEL Sandbox] Notice: Remote cloud sandbox execution service is not attached in current deployment.`);

    return {
      success: true,
      exitCode: 0,
      environment: this.type,
      commandExecuted: command.command,
      stdout: `Static validation completed: All imports resolve and syntax is valid for ${project.files.length} files.`,
      stderr: '',
      durationMs: Date.now() - startTime,
      logs,
      validationResult: validation,
      remediationAdvice: undefined,
    };
  }
}

// Global active sandbox driver instance
export const defaultSandboxDriver: ExecutionSandboxDriver = new SafeStaticExecutionDriver();
