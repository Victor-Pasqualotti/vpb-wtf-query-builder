import { Injectable } from '@angular/core';
import { Rule, RuleSet } from 'angular2-query-builder';
import { QueryPayload } from '../models/query-builder.model';

@Injectable({
  providedIn: 'root'
})
export class SqlPreviewService {
  /**
   * Generates a Trino/Athena SQL preview from the QueryPayload.
   * Note: The frontend produces the JSON payload, which the AWS Lambda backend
   * validates and compiles into SQL securely before execution.
   */
  generateSql(payload: QueryPayload): string {
    const columnsPart = payload.colunas && payload.colunas.length > 0
      ? payload.colunas.map((c) => `  ${c}`).join(',\n')
      : '  *';

    const fromPart = payload.tabela || 'tabela_indefinida';

    let whereClause = '';
    if (payload.filtros && payload.filtros.rules && payload.filtros.rules.length > 0) {
      const condition = this.parseRuleSet(payload.filtros);
      if (condition) {
        whereClause = `\nWHERE\n  ${condition}`;
      }
    }

    const limitPart = payload.limite ? `\nLIMIT ${payload.limite}` : '\nLIMIT 100';

    return `SELECT\n${columnsPart}\nFROM\n  ${fromPart}${whereClause}${limitPart};`;
  }

  private parseRuleSet(ruleSet: RuleSet): string {
    if (!ruleSet.rules || ruleSet.rules.length === 0) {
      return '';
    }

    const operator = ` ${ruleSet.condition.toUpperCase()} `;
    const parts: string[] = [];

    for (const ruleOrSet of ruleSet.rules) {
      if ('rules' in ruleOrSet) {
        const subResult = this.parseRuleSet(ruleOrSet as RuleSet);
        if (subResult) {
          parts.push(`(${subResult})`);
        }
      } else {
        const rule = ruleOrSet as Rule;
        const conditionStr = this.formatRule(rule);
        if (conditionStr) {
          parts.push(conditionStr);
        }
      }
    }

    return parts.join(operator);
  }

  private formatRule(rule: Rule): string {
    if (!rule.field) {
      return '';
    }

    const field = rule.field;
    const op = rule.operator;
    let val = rule.value;

    if (op === 'is null' || op === 'is not null') {
      return `${field} ${op.toUpperCase()}`;
    }

    if (val === undefined || val === null || val === '') {
      return '';
    }

    switch (op) {
      case '=':
      case '!=':
      case '>':
      case '>=':
      case '<':
      case '<=':
        if (typeof val === 'number') {
          return `${field} ${op} ${val}`;
        }
        if (typeof val === 'boolean') {
          return `${field} ${op} ${val ? 'TRUE' : 'FALSE'}`;
        }
        return `${field} ${op} '${this.escapeSql(String(val))}'`;

      case 'contains':
        return `${field} LIKE '%${this.escapeSql(String(val))}%'`;

      case 'like':
        return `${field} LIKE '${this.escapeSql(String(val))}'`;

      case 'in':
      case 'not in':
        if (Array.isArray(val) && val.length > 0) {
          const list = val.map((v) => `'${this.escapeSql(String(v))}'`).join(', ');
          return `${field} ${op.toUpperCase()} (${list})`;
        }
        return `${field} ${op.toUpperCase()} ('${this.escapeSql(String(val))}')`;

      default:
        return `${field} ${op} '${this.escapeSql(String(val))}'`;
    }
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
