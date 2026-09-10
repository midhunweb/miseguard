/**
 * MiSeGuard UI Reporter
 * Formats rich colored terminal alerts, risk score gauges, and diff cards.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import type { EvaluationResult } from '../engine/blast-radius.js';
import type { DiffReport } from '../sandbox/diff-analyzer.js';

export class Reporter {
  private static renderGauge(score: number): string {
    const totalBars = 20;
    const filledBars = Math.round((score / 100) * totalBars);
    const emptyBars = totalBars - filledBars;

    let colorFn = chalk.green;
    if (score >= 70) colorFn = chalk.red;
    else if (score >= 30) colorFn = chalk.yellow;

    const barStr = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    return `${colorFn(barStr)} ${chalk.bold(`${score}/100`)}`;
  }

  public static printHeader(): void {
    console.error(
      chalk.cyanBright.bold(`
 ╔══════════════════════════════════════════════════════════════╗
 ║                     🛡️  MiSeGuard v0.1.0                     ║
 ║        Deterministic AI Agent Circuit Breaker & Proxy        ║
 ╚══════════════════════════════════════════════════════════════╝
`)
    );
  }

  public static printEvaluation(commandOrTool: string, result: EvaluationResult): void {
    const { score, level, action, triggeredRules, reasons, affectedTargets, remediations } = result;

    let badge = '';
    let borderChar = '';

    if (level === 'RED') {
      badge = chalk.bgRed.black.bold(' 🔴 CIRCUIT BREAKER TRIGGERED: BLOCKED ');
      borderChar = chalk.red('━');
    } else if (level === 'YELLOW') {
      badge = chalk.bgYellow.black.bold(' 🟡 CAUTION: DRY-RUN INSPECTION ');
      borderChar = chalk.yellow('━');
    } else {
      badge = chalk.bgGreen.black.bold(' 🟢 SAFE: EXECUTION PERMITTED ');
      borderChar = chalk.green('━');
    }

    const divider = borderChar.repeat(64);
    console.error(`\n${divider}`);
    console.error(`${badge}  [Score: ${Reporter.renderGauge(score)}]`);
    console.error(`${chalk.bold('Operation:')} ${chalk.italic(commandOrTool)}`);
    console.error(`${divider}`);

    if (reasons.length > 0) {
      console.error(chalk.bold('\n🔍 Analysis & Hazard Triggers:'));
      for (const r of reasons) {
        console.error(`  ${level === 'RED' ? chalk.red('✖') : level === 'YELLOW' ? chalk.yellow('▲') : chalk.green('✔')} ${r}`);
      }
    }

    if (affectedTargets.length > 0) {
      console.error(chalk.bold('\n🎯 Affected Targets:'));
      for (const t of affectedTargets) {
        console.error(`  • ${chalk.magenta(t)}`);
      }
    }

    if (triggeredRules.length > 0) {
      console.error(chalk.bold('\n📜 Violated Security Rules:'));
      for (const rule of triggeredRules) {
        console.error(`  • [${chalk.cyan(rule.id)}] ${chalk.bold(rule.name)} (${rule.category})`);
        console.error(`    ${chalk.dim(rule.description)}`);
      }
    }

    if (remediations.length > 0) {
      console.error(chalk.bold('\n💡 Recommended Safe Alternatives:'));
      for (const rem of remediations) {
        console.error(`  → ${chalk.cyan(rem)}`);
      }
    }

    console.error(`${divider}\n`);
  }

  public static printDiffReport(diff: DiffReport): void {
    if (diff.totalChanges === 0) {
      console.error(chalk.gray('ℹ️  No filesystem modifications detected during sandbox dry-run.'));
      return;
    }

    console.error(chalk.bold(`\n📦 Dry-Run Sandbox Diff Analysis (${diff.totalChanges} total changes):`));

    const table = new Table({
      head: [chalk.cyan('Status'), chalk.cyan('Relative Path'), chalk.cyan('Size Delta'), chalk.cyan('Sensitive')],
      style: { head: [], border: [] },
    });

    for (const delta of diff.deltas) {
      let statusColor = chalk.green;
      if (delta.status === 'DELETED') statusColor = chalk.red;
      if (delta.status === 'MODIFIED') statusColor = chalk.yellow;

      let sizeDelta = '-';
      if (delta.status === 'ADDED' && delta.newSizeBytes !== undefined) {
        sizeDelta = `+${delta.newSizeBytes} B`;
      } else if (delta.status === 'DELETED' && delta.oldSizeBytes !== undefined) {
        sizeDelta = `-${delta.oldSizeBytes} B`;
      } else if (delta.status === 'MODIFIED' && delta.oldSizeBytes !== undefined && delta.newSizeBytes !== undefined) {
        const diffSize = delta.newSizeBytes - delta.oldSizeBytes;
        sizeDelta = `${diffSize >= 0 ? '+' : ''}${diffSize} B`;
      }

      table.push([
        statusColor(delta.status),
        delta.relativePath,
        sizeDelta,
        delta.isSensitive ? chalk.bgRed.white(' SENSITIVE ') : chalk.gray('No'),
      ]);
    }

    console.error(table.toString());
  }

  public static printRulesList(rules: Record<string, any>): void {
    Reporter.printHeader();
    console.log(chalk.bold('\nActive Circuit Breaker Security Rules Matrix:\n'));

    const table = new Table({
      head: [chalk.cyan('Rule ID'), chalk.cyan('Level'), chalk.cyan('Score'), chalk.cyan('Category'), chalk.cyan('Description')],
      colWidths: [32, 10, 8, 14, 45],
      wordWrap: true,
      style: { head: [], border: [] },
    });

    for (const rule of Object.values(rules)) {
      let levelBadge = chalk.green('GREEN');
      if (rule.level === 'RED') levelBadge = chalk.red.bold('RED');
      else if (rule.level === 'YELLOW') levelBadge = chalk.yellow.bold('YELLOW');

      table.push([
        rule.id,
        levelBadge,
        `${rule.baseScore}`,
        rule.category,
        rule.description,
      ]);
    }

    console.log(table.toString());
    console.log('');
  }
}
