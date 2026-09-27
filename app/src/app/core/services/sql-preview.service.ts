import { Injectable } from '@angular/core';
import { Rule, RuleSet } from 'angular2-query-builder';
import { CalculatedColumn, QueryPayload } from '../models/query-builder.model';

@Injectable({
  providedIn: 'root'
})
export class SqlPreviewService {
  /**
   * Generates a Trino/Athena SQL preview from the QueryPayload.
   * Note: The frontend produces the JSON payload (AST), which the AWS Lambda backend
   * validates and compiles into SQL securely before execution on AWS Athena.
   */
  generateSql(payload: QueryPayload): string {
    const projectionParts: string[] = [];

    // Regular selected columns
    if (payload.colunas && payload.colunas.length > 0) {
      for (const col of payload.colunas) {
        projectionParts.push(`  ${col}`);
      }
    }

    // Calculated columns
    if (payload.colunas_calculadas && payload.colunas_calculadas.length > 0) {
      for (const calc of payload.colunas_calculadas) {
        projectionParts.push(`  ${this.formatCalculatedColumn(calc)}`);
      }
    }

    const selectClause = projectionParts.length > 0
      ? projectionParts.join(',\n')
      : '  *';

    const fromPart = payload.tabela || 'tabela_indefinida';

    // JOINs clause
    let joinsClause = '';
    if (payload.joins && payload.joins.length > 0) {
      const joinLines = payload.joins.map((j) => {
        const onConditions = j.condicoes && j.condicoes.length > 0
          ? j.condicoes.map((c) => `${c.coluna_origem} ${c.operador || '='} ${c.coluna_destino}`).join(' AND ')
          : '1 = 1';
        return `${j.tipo} ${j.tabela}\n  ON ${onConditions}`;
      });
      joinsClause = `\n${joinLines.join('\n')}`;
    }

    // WHERE clause
    let whereClause = '';
    if (payload.filtros && payload.filtros.rules && payload.filtros.rules.length > 0) {
      const condition = this.parseRuleSet(payload.filtros);
      if (condition) {
        whereClause = `\nWHERE\n  ${condition}`;
      }
    }

    // GROUP BY clause (required when aggregate calculated columns are present)
    let groupByClause = '';
    if (payload.group_by && payload.group_by.length > 0) {
      groupByClause = `\nGROUP BY\n  ${payload.group_by.join(', ')}`;
    }

    // HAVING clause (enabled when aggregations are present)
    let havingClause = '';
    if (payload.having && payload.having.rules && payload.having.rules.length > 0) {
      const havingCondition = this.parseRuleSet(payload.having);
      if (havingCondition) {
        havingClause = `\nHAVING\n  ${havingCondition}`;
      }
    }

    const limitPart = payload.limite ? `\nLIMIT ${payload.limite}` : '\nLIMIT 100';

    return `SELECT\n${selectClause}\nFROM\n  ${fromPart}${joinsClause}${whereClause}${groupByClause}${havingClause}${limitPart};`;
  }

  private formatCalculatedColumn(calc: CalculatedColumn): string {
    switch (calc.tipo) {
      case 'row_number': {
        const partition = calc.partition_by && calc.partition_by.length > 0
          ? `PARTITION BY ${calc.partition_by.join(', ')} `
          : '';
        const orderCol = calc.order_by ? calc.order_by.coluna : '1';
        const orderDir = calc.order_by ? calc.order_by.direcao : 'ASC';
        const order = `ORDER BY ${orderCol} ${orderDir}`;
        return `ROW_NUMBER() OVER (${partition}${order}) AS "${this.escapeAlias(calc.alias)}"`;
      }

      case 'agregacao': {
        const colName = calc.colunas && calc.colunas.length > 0 ? calc.colunas[0] : '*';
        switch (calc.funcao) {
          case 'max':
            return `MAX(${colName}) AS "${this.escapeAlias(calc.alias)}"`;
          case 'min':
            return `MIN(${colName}) AS "${this.escapeAlias(calc.alias)}"`;
          case 'sum':
            return `SUM(${colName}) AS "${this.escapeAlias(calc.alias)}"`;
          case 'avg':
            return `AVG(${colName}) AS "${this.escapeAlias(calc.alias)}"`;
          case 'count':
            return `COUNT(${colName}) AS "${this.escapeAlias(calc.alias)}"`;
          case 'count_distinct':
            return `COUNT(DISTINCT ${colName}) AS "${this.escapeAlias(calc.alias)}"`;
          case 'concat':
            return `CONCAT(${calc.colunas.join(', ')}) AS "${this.escapeAlias(calc.alias)}"`;
          default:
            return `${String(calc.funcao).toUpperCase()}(${colName}) AS "${this.escapeAlias(calc.alias)}"`;
        }
      }

      case 'operacao': {
        if (!calc.colunas || calc.colunas.length < 2) {
          return `(${calc.colunas?.[0] || '0'}) AS "${this.escapeAlias(calc.alias)}"`;
        }
        const opStr = ` ${calc.operador} `;
        return `(${calc.colunas.join(opStr)}) AS "${this.escapeAlias(calc.alias)}"`;
      }

      default:
        return `NULL AS "${this.escapeAlias((calc as any).alias || 'calc')}"`;
    }
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

  private escapeAlias(alias: string): string {
    return alias.replace(/"/g, '""');
  }
}
