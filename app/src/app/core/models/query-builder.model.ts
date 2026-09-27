import { QueryBuilderConfig, RuleSet } from 'angular2-query-builder';

export type ColumnType = 'string' | 'number' | 'category' | 'date' | 'boolean' | 'time';

export interface ColumnOption {
  name: string;
  value: any;
}

export interface ColumnDefinition {
  name: string;
  label: string;
  type: ColumnType;
  description?: string;
  options?: ColumnOption[];
  tableId?: string;
  tableName?: string;
}

export interface TableDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  columns: ColumnDefinition[];
}

/* Tipos de JOIN */
export type JoinType = 'LEFT JOIN' | 'INNER JOIN';

export interface JoinCondition {
  colunaOrigem: string;   // ex: "vendas_2023.cliente_id"
  operador: '=';          // operador de igualdade
  colunaDestino: string;  // ex: "clientes_ativos.cliente_id"
}

export interface JoinDefinition {
  id: string;
  tipo: JoinType;
  tabelaOrigem: string;
  tabelaDestino: string;
  condicoes: JoinCondition[];
}

export interface QueryPayloadJoinCondition {
  coluna_origem: string;
  operador: string;
  coluna_destino: string;
}

export interface QueryPayloadJoin {
  tipo: JoinType;
  tabela: string;
  condicoes: QueryPayloadJoinCondition[];
}

/* Tipos de Colunas Calculadas */
export type CalculatedColumnType = 'row_number' | 'agregacao' | 'operacao';

export type AggregateFunction = 'max' | 'min' | 'count' | 'count_distinct' | 'sum' | 'avg' | 'concat';

export type MathOperator = '+' | '-' | '=';

export interface OrderByDefinition {
  coluna: string;
  direcao: 'ASC' | 'DESC';
}

export interface RowNumberCalculatedColumn {
  tipo: 'row_number';
  alias: string;
  partition_by?: string[];
  order_by: OrderByDefinition;
}

export interface AggregateCalculatedColumn {
  tipo: 'agregacao';
  funcao: AggregateFunction;
  colunas: string[];
  alias: string;
}

export interface MathCalculatedColumn {
  tipo: 'operacao';
  operador: MathOperator;
  colunas: string[];
  alias: string;
}

export type CalculatedColumn = RowNumberCalculatedColumn | AggregateCalculatedColumn | MathCalculatedColumn;

export interface QueryPayload {
  tabela: string;
  joins?: QueryPayloadJoin[];
  colunas: string[];
  colunas_calculadas?: CalculatedColumn[];
  group_by?: string[];
  having?: RuleSet;
  filtros: RuleSet;
  limite: number;
  geradoEm?: string;
}
