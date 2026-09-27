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
}

export interface TableDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  columns: ColumnDefinition[];
}

export interface QueryPayload {
  tabela: string;
  colunas: string[];
  filtros: RuleSet;
  limite: number;
  geradoEm?: string;
}
