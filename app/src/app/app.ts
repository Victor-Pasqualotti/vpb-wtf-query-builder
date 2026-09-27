import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QueryBuilderConfig, QueryBuilderModule, RuleSet } from 'angular2-query-builder';
import {
  AggregateCalculatedColumn,
  AggregateFunction,
  CalculatedColumn,
  CalculatedColumnType,
  ColumnDefinition,
  JoinCondition,
  JoinDefinition,
  JoinType,
  MathCalculatedColumn,
  MathOperator,
  QueryPayload,
  QueryPayloadJoin,
  RowNumberCalculatedColumn,
  TableDefinition
} from './core/models/query-builder.model';
import { MetadataService } from './core/services/metadata.service';
import { SqlPreviewService } from './core/services/sql-preview.service';

export interface TableColumnGroup {
  table: TableDefinition;
  isBase: boolean;
  joinType?: JoinType;
  columns: Array<ColumnDefinition & { qualifiedName: string }>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, QueryBuilderModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  // 1. Origem dos Dados (FROM)
  public tables: TableDefinition[] = [];
  public selectedTableId = 'vendas_2023';

  // 1.1 Configuração de JOINs
  public wantsJoins = false;
  public activeJoins: JoinDefinition[] = [];
  public selectedJoinTableId = '';
  public selectedJoinType: JoinType = 'LEFT JOIN';
  public currentJoinConditions: JoinCondition[] = [];
  public joinFormError = '';

  // 2. Colunas (SELECT)
  public availableColumns: ColumnDefinition[] = [];
  public selectedColumns: string[] = [];

  // 2.1 Colunas Calculadas
  public calculatedColumns: CalculatedColumn[] = [];
  public calcType: CalculatedColumnType = 'row_number';
  
  // Form - Row Number
  public rowNumAlias = 'num_linha';
  public rowNumPartitionBy: string[] = [];
  public rowNumOrderCol = '';
  public rowNumOrderDir: 'ASC' | 'DESC' = 'ASC';

  // Form - Agregação (GROUP BY / HAVING)
  public aggFunc: AggregateFunction = 'sum';
  public aggCol = '';
  public aggConcatCols: string[] = [];
  public aggAlias = 'total_soma';

  // Form - Operação Matemática
  public mathOp: MathOperator = '+';
  public mathCol1 = '';
  public mathCol2 = '';
  public mathAlias = 'calc_resultado';

  public calcFormError = '';

  // 3. Filtros (WHERE)
  public queryConfig: QueryBuilderConfig = { fields: {} };
  public query: RuleSet = {
    condition: 'and',
    rules: []
  };

  // 3.1 Filtros de Agrupamento (HAVING) - Habilitado quando há agregação
  public havingConfig: QueryBuilderConfig = { fields: {} };
  public havingQuery: RuleSet = {
    condition: 'and',
    rules: []
  };

  // 4. Limite de Resultados (LIMIT)
  public limit = 100;
  public readonly minLimit = 1;
  public readonly maxLimit = 1000;

  // 5. Ação e Saída (Payload & SQL Preview)
  public generatedPayload: QueryPayload | null = null;
  public sqlPreview = '';
  public copyFeedback = false;
  public copySqlFeedback = false;
  public validationError = '';

  public activeTableIds: string[] = [];
  public availableJoinTables: TableDefinition[] = [];
  public activeTableGroups: TableColumnGroup[] = [];
  public allActiveColumns: Array<ColumnDefinition & { qualifiedName: string }> = [];
  public numericColumns: Array<ColumnDefinition & { qualifiedName: string }> = [];

  constructor(
    private readonly metadataService: MetadataService,
    private readonly sqlPreviewService: SqlPreviewService
  ) {}

  ngOnInit(): void {
    this.tables = this.metadataService.getTables();
    this.onTableChange(this.selectedTableId, true);
  }

  get currentTable(): TableDefinition | undefined {
    return this.metadataService.getTableById(this.selectedTableId);
  }

  get hasAggregations(): boolean {
    return this.calculatedColumns.some((c) => c.tipo === 'agregacao');
  }

  get groupByColumns(): string[] {
    return this.hasAggregations ? [...this.selectedColumns] : [];
  }

  /**
   * Atualiza as estruturas cacheadas de tabelas e colunas para evitar novas alocações em ciclos de detecção
   */
  public refreshActiveTableStructures(): void {
    const joined = this.activeJoins.map((j) => j.tabelaDestino);
    this.activeTableIds = [this.selectedTableId, ...joined];
    this.availableJoinTables = this.metadataService.getAvailableJoinTables(this.selectedTableId, joined);

    const groups: TableColumnGroup[] = [];
    const baseTable = this.metadataService.getTableById(this.selectedTableId);
    const hasMultiple = this.activeTableIds.length > 1;

    if (baseTable) {
      groups.push({
        table: baseTable,
        isBase: true,
        columns: baseTable.columns.map((c) => ({
          ...c,
          qualifiedName: hasMultiple ? `${baseTable.id}.${c.name}` : c.name
        }))
      });
    }

    for (const join of this.activeJoins) {
      const joinTbl = this.metadataService.getTableById(join.tabelaDestino);
      if (joinTbl) {
        groups.push({
          table: joinTbl,
          isBase: false,
          joinType: join.tipo,
          columns: joinTbl.columns.map((c) => ({
            ...c,
            qualifiedName: `${joinTbl.id}.${c.name}`
          }))
        });
      }
    }

    this.activeTableGroups = groups;

    const all: Array<ColumnDefinition & { qualifiedName: string }> = [];
    for (const group of groups) {
      all.push(...group.columns);
    }
    this.allActiveColumns = all;
    this.numericColumns = all.filter((c) => c.type === 'number');
  }

  /**
   * Responde dinamicamente à alteração da tabela selecionada (FROM)
   */
  public onTableChange(tableId: string, isInitial = false): void {
    this.selectedTableId = tableId;
    const table = this.metadataService.getTableById(tableId);

    if (!table) {
      return;
    }

    // Reseta joins e colunas calculadas ao mudar a tabela base
    this.wantsJoins = false;
    this.activeJoins = [];
    this.calculatedColumns = [];

    this.refreshAvailableColumnsAndConfig(isInitial);
    this.initJoinForm();

    this.validationError = '';
    if (this.generatedPayload) {
      this.generatePayload();
    }
  }

  /**
   * Atualiza a lista de colunas disponíveis e a configuração do QueryBuilder (WHERE)
   */
  private refreshAvailableColumnsAndConfig(isInitial = false): void {
    this.refreshActiveTableStructures();
    const hasMultiple = this.activeTableIds.length > 1;
    const baseTable = this.metadataService.getTableById(this.selectedTableId);

    if (!baseTable) return;

    this.availableColumns = baseTable.columns;

    // Se é a inicialização sem joins, seleciona colunas da tabela base
    if (isInitial) {
      this.selectedColumns = ['cliente_id', 'valor_total', 'data_compra', 'canal_venda'];
    } else if (!hasMultiple) {
      this.selectedColumns = baseTable.columns.slice(0, 4).map((c) => c.name);
    }

    // Atualiza a configuração do QueryBuilder para suportar múltiplas tabelas com entidades
    this.queryConfig = this.metadataService.getMultiTableQueryBuilderConfig(this.activeTableIds);

    // Ajusta o primeiro filtro padrão
    const firstCol = this.allActiveColumns[0];
    if (firstCol) {
      this.query = {
        condition: 'and',
        rules: [
          {
            field: firstCol.qualifiedName,
            operator: firstCol.type === 'number' ? '>=' : '=',
            value: firstCol.type === 'number' ? 0 : ''
          }
        ]
      };
    }

    this.updateHavingConfig();
    this.resetCalculatedColumnForm();
  }

  /* ========================================================
   * MÉTODOS DE CONFIGURAÇÃO DE JOINS
   * ======================================================== */

  public onWantsJoinsChange(wants: boolean): void {
    this.wantsJoins = wants;
    if (!wants) {
      this.activeJoins = [];
      // Remove colunas pertencentes a outras tabelas
      this.selectedColumns = this.selectedColumns.filter((col) => !col.includes('.') || col.startsWith(`${this.selectedTableId}.`));
      this.refreshAvailableColumnsAndConfig(false);
      if (this.generatedPayload) {
        this.generatePayload();
      }
    } else {
      this.initJoinForm();
    }
  }

  public initJoinForm(): void {
    this.refreshActiveTableStructures();
    this.joinFormError = '';
    const available = this.availableJoinTables;
    if (available.length > 0) {
      this.selectedJoinTableId = available[0].id;
      this.selectedJoinType = 'LEFT JOIN';
      this.setupDefaultJoinConditions();
    } else {
      this.selectedJoinTableId = '';
      this.currentJoinConditions = [];
    }
  }

  public onJoinTargetTableChange(): void {
    this.setupDefaultJoinConditions();
  }

  private setupDefaultJoinConditions(): void {
    if (!this.selectedJoinTableId) {
      this.currentJoinConditions = [];
      return;
    }

    // Tenta encontrar uma chave comum com a tabela base ou tabelas já ativas
    const common = this.metadataService.getCommonJoinKeys(this.selectedTableId, this.selectedJoinTableId);
    this.currentJoinConditions = [
      {
        colunaOrigem: common.colA,
        operador: '=',
        colunaDestino: common.colB
      }
    ];
  }

  public addJoinCondition(): void {
    const baseTable = this.metadataService.getTableById(this.selectedTableId);
    const targetTable = this.metadataService.getTableById(this.selectedJoinTableId);

    const defaultOrigem = baseTable ? `${baseTable.id}.${baseTable.columns[0]?.name}` : '';
    const defaultDestino = targetTable ? `${targetTable.id}.${targetTable.columns[0]?.name}` : '';

    this.currentJoinConditions.push({
      colunaOrigem: defaultOrigem,
      operador: '=',
      colunaDestino: defaultDestino
    });
  }

  public removeJoinCondition(index: number): void {
    if (this.currentJoinConditions.length > 1) {
      this.currentJoinConditions.splice(index, 1);
    }
  }

  public getColumnsForTable(tableId: string): ColumnDefinition[] {
    const tbl = this.metadataService.getTableById(tableId);
    return tbl ? tbl.columns : [];
  }

  public addJoin(): void {
    this.joinFormError = '';

    if (!this.selectedJoinTableId) {
      this.joinFormError = 'Selecione uma tabela para realizar o JOIN.';
      return;
    }

    if (this.currentJoinConditions.length === 0) {
      this.joinFormError = 'Adicione ao menos uma condição de junção (ON).';
      return;
    }

    for (const cond of this.currentJoinConditions) {
      if (!cond.colunaOrigem || !cond.colunaDestino) {
        this.joinFormError = 'Preencha as colunas de origem e destino em todas as condições ON.';
        return;
      }
    }

    const newJoin: JoinDefinition = {
      id: `${this.selectedJoinType}_${this.selectedJoinTableId}_${Date.now()}`,
      tipo: this.selectedJoinType,
      tabelaOrigem: this.selectedTableId,
      tabelaDestino: this.selectedJoinTableId,
      condicoes: JSON.parse(JSON.stringify(this.currentJoinConditions))
    };

    this.activeJoins.push(newJoin);

    // Se antes havia apenas 1 tabela, converte as colunas já selecionadas para o formato qualificado
    if (this.activeJoins.length === 1) {
      this.selectedColumns = this.selectedColumns.map((c) => c.includes('.') ? c : `${this.selectedTableId}.${c}`);
    }

    // Adiciona por conveniência as 2 primeiras colunas da tabela que foi joined
    const joinedTbl = this.metadataService.getTableById(this.selectedJoinTableId);
    if (joinedTbl) {
      for (const col of joinedTbl.columns.slice(0, 2)) {
        const qName = `${joinedTbl.id}.${col.name}`;
        if (!this.selectedColumns.includes(qName)) {
          this.selectedColumns.push(qName);
        }
      }
    }

    // Atualiza a configuração global com a nova tabela ativa
    this.refreshAvailableColumnsAndConfig(false);
    this.initJoinForm();

    if (this.generatedPayload) {
      this.generatePayload();
    }
  }

  public removeJoin(index: number): void {
    const removed = this.activeJoins[index];
    this.activeJoins.splice(index, 1);

    if (removed) {
      // Remove colunas selecionadas da tabela removida
      this.selectedColumns = this.selectedColumns.filter((col) => !col.startsWith(`${removed.tabelaDestino}.`));

      // Remove colunas calculadas que faziam referência à tabela removida
      this.calculatedColumns = this.calculatedColumns.filter((calc) => {
        if (calc.tipo === 'agregacao' && calc.colunas.some((c) => c.startsWith(`${removed.tabelaDestino}.`))) {
          return false;
        }
        if (calc.tipo === 'operacao' && calc.colunas.some((c) => c.startsWith(`${removed.tabelaDestino}.`))) {
          return false;
        }
        if (calc.tipo === 'row_number' && calc.order_by?.coluna?.startsWith(`${removed.tabelaDestino}.`)) {
          return false;
        }
        return true;
      });
    }

    // Se restou apenas a tabela base, volta nomes para formato simples
    if (this.activeJoins.length === 0) {
      this.selectedColumns = this.selectedColumns.map((c) => c.replace(`${this.selectedTableId}.`, ''));
    }

    this.refreshAvailableColumnsAndConfig(false);
    this.initJoinForm();

    if (this.generatedPayload) {
      this.generatePayload();
    }
  }

  /* ========================================================
   * MÉTODOS DE SELEÇÃO DE COLUNAS
   * ======================================================== */

  public toggleColumn(columnIdentifier: string): void {
    const index = this.selectedColumns.indexOf(columnIdentifier);
    if (index > -1) {
      this.selectedColumns.splice(index, 1);
    } else {
      this.selectedColumns.push(columnIdentifier);
    }
    this.updateHavingConfig();
  }

  public isColumnSelected(columnIdentifier: string): boolean {
    return this.selectedColumns.includes(columnIdentifier);
  }

  public selectAllColumns(): void {
    this.selectedColumns = this.allActiveColumns.map((c) => c.qualifiedName);
    this.updateHavingConfig();
  }

  public clearAllColumns(): void {
    this.selectedColumns = [];
    this.updateHavingConfig();
  }

  public selectAllTableColumns(group: TableColumnGroup): void {
    for (const col of group.columns) {
      if (!this.selectedColumns.includes(col.qualifiedName)) {
        this.selectedColumns.push(col.qualifiedName);
      }
    }
    this.updateHavingConfig();
  }

  public clearTableColumns(group: TableColumnGroup): void {
    const groupNames = group.columns.map((c) => c.qualifiedName);
    this.selectedColumns = this.selectedColumns.filter((c) => !groupNames.includes(c));
    this.updateHavingConfig();
  }

  /* ========================================================
   * MÉTODOS DE COLUNAS CALCULADAS
   * ======================================================== */

  public resetCalculatedColumnForm(): void {
    this.calcFormError = '';
    const numCols = this.numericColumns;
    const allCols = this.allActiveColumns;

    this.rowNumAlias = `num_linha_${this.calculatedColumns.length + 1}`;
    this.rowNumPartitionBy = [];
    this.rowNumOrderCol = allCols[0]?.qualifiedName || '';
    this.rowNumOrderDir = 'ASC';

    this.aggFunc = 'sum';
    this.aggCol = numCols[0]?.qualifiedName || allCols[0]?.qualifiedName || '';
    this.aggConcatCols = [allCols[0]?.qualifiedName || '', allCols[1]?.qualifiedName || ''];
    this.aggAlias = `total_${this.aggFunc}_${this.calculatedColumns.length + 1}`;

    this.mathOp = '+';
    this.mathCol1 = numCols[0]?.qualifiedName || allCols[0]?.qualifiedName || '';
    this.mathCol2 = numCols[1]?.qualifiedName || allCols[1]?.qualifiedName || allCols[0]?.qualifiedName || '';
    this.mathAlias = `calc_${this.calculatedColumns.length + 1}`;
  }

  public onAggFuncChange(): void {
    const numCols = this.numericColumns;
    const allCols = this.allActiveColumns;

    if (this.aggFunc === 'sum' || this.aggFunc === 'avg') {
      this.aggCol = numCols[0]?.qualifiedName || allCols[0]?.qualifiedName || '';
    } else if (this.aggFunc === 'concat') {
      if (this.aggConcatCols.length === 0) {
        this.aggConcatCols = allCols.slice(0, 2).map((c) => c.qualifiedName);
      }
    } else {
      this.aggCol = allCols[0]?.qualifiedName || '';
    }
    const cleanCol = this.aggCol ? this.aggCol.replace('.', '_') : 'col';
    this.aggAlias = `${this.aggFunc}_${cleanCol}`;
  }

  public togglePartitionBy(colQualified: string): void {
    const idx = this.rowNumPartitionBy.indexOf(colQualified);
    if (idx > -1) {
      this.rowNumPartitionBy.splice(idx, 1);
    } else {
      this.rowNumPartitionBy.push(colQualified);
    }
  }

  public isPartitionBySelected(colQualified: string): boolean {
    return this.rowNumPartitionBy.includes(colQualified);
  }

  public toggleConcatCol(colQualified: string): void {
    const idx = this.aggConcatCols.indexOf(colQualified);
    if (idx > -1) {
      this.aggConcatCols.splice(idx, 1);
    } else {
      this.aggConcatCols.push(colQualified);
    }
  }

  public isConcatColSelected(colQualified: string): boolean {
    return this.aggConcatCols.includes(colQualified);
  }

  public addCalculatedColumn(): void {
    this.calcFormError = '';

    if (this.calcType === 'row_number') {
      const alias = this.sanitizeAlias(this.rowNumAlias);
      if (!alias) {
        this.calcFormError = 'Informe um alias/nome válido para a coluna de Row Number.';
        return;
      }
      if (this.isAliasTaken(alias)) {
        this.calcFormError = `O alias "${alias}" já está em uso na consulta.`;
        return;
      }
      if (!this.rowNumOrderCol) {
        this.calcFormError = 'Selecione uma coluna para a ordenação (ORDER BY) da função ROW_NUMBER.';
        return;
      }

      const col: RowNumberCalculatedColumn = {
        tipo: 'row_number',
        alias,
        partition_by: this.rowNumPartitionBy.length > 0 ? [...this.rowNumPartitionBy] : undefined,
        order_by: {
          coluna: this.rowNumOrderCol,
          direcao: this.rowNumOrderDir
        }
      };
      this.calculatedColumns.push(col);

    } else if (this.calcType === 'agregacao') {
      const alias = this.sanitizeAlias(this.aggAlias);
      if (!alias) {
        this.calcFormError = 'Informe um alias/nome válido para a agregação.';
        return;
      }
      if (this.isAliasTaken(alias)) {
        this.calcFormError = `O alias "${alias}" já está em uso na consulta.`;
        return;
      }

      let targetCols: string[] = [];
      if (this.aggFunc === 'concat') {
        if (this.aggConcatCols.length < 2) {
          this.calcFormError = 'A função CONCAT requer ao menos 2 colunas para concatenar.';
          return;
        }
        targetCols = [...this.aggConcatCols];
      } else {
        if (!this.aggCol) {
          this.calcFormError = 'Selecione a coluna que receberá a função de agregação.';
          return;
        }
        targetCols = [this.aggCol];
      }

      const col: AggregateCalculatedColumn = {
        tipo: 'agregacao',
        funcao: this.aggFunc,
        colunas: targetCols,
        alias
      };
      this.calculatedColumns.push(col);

    } else if (this.calcType === 'operacao') {
      const alias = this.sanitizeAlias(this.mathAlias);
      if (!alias) {
        this.calcFormError = 'Informe um alias/nome válido para a operação calculada.';
        return;
      }
      if (this.isAliasTaken(alias)) {
        this.calcFormError = `O alias "${alias}" já está em uso na consulta.`;
        return;
      }
      if (!this.mathCol1 || !this.mathCol2) {
        this.calcFormError = 'Selecione as duas colunas envolvidas na operação.';
        return;
      }

      const col: MathCalculatedColumn = {
        tipo: 'operacao',
        operador: this.mathOp,
        colunas: [this.mathCol1, this.mathCol2],
        alias
      };
      this.calculatedColumns.push(col);
    }

    this.updateHavingConfig();
    this.resetCalculatedColumnForm();

    if (this.generatedPayload) {
      this.generatePayload();
    }
  }

  public removeCalculatedColumn(index: number): void {
    this.calculatedColumns.splice(index, 1);
    this.updateHavingConfig();
    if (this.generatedPayload) {
      this.generatePayload();
    }
  }

  public updateHavingConfig(): void {
    if (!this.hasAggregations) {
      this.havingConfig = { fields: {} };
      this.havingQuery = { condition: 'and', rules: [] };
      return;
    }

    const fieldsConfig: Record<string, any> = {};

    for (const calc of this.calculatedColumns) {
      if (calc.tipo === 'agregacao') {
        const colLabel = calc.funcao === 'concat'
          ? `CONCAT(${calc.colunas.join(', ')})`
          : `${calc.funcao.toUpperCase()}(${calc.colunas[0]})`;

        fieldsConfig[calc.alias] = {
          name: `${calc.alias} (${colLabel})`,
          type: calc.funcao === 'concat' ? 'string' : 'number'
        };
      }
    }

    this.havingConfig = { fields: fieldsConfig };

    const aggKeys = Object.keys(fieldsConfig);
    if (aggKeys.length > 0 && (!this.havingQuery.rules || this.havingQuery.rules.length === 0)) {
      this.havingQuery = {
        condition: 'and',
        rules: [
          {
            field: aggKeys[0],
            operator: '>',
            value: 0
          }
        ]
      };
    }
  }

  private sanitizeAlias(alias: string): string {
    return alias.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private isAliasTaken(alias: string): boolean {
    const inCols = this.selectedColumns.includes(alias);
    const inCalc = this.calculatedColumns.some((c) => c.alias.toLowerCase() === alias.toLowerCase());
    return inCols || inCalc;
  }

  public getCalculatedColumnFormula(calc: CalculatedColumn): string {
    switch (calc.tipo) {
      case 'row_number': {
        const part = calc.partition_by && calc.partition_by.length > 0
          ? `PARTITION BY ${calc.partition_by.join(', ')} `
          : '';
        const ord = calc.order_by ? `ORDER BY ${calc.order_by.coluna} ${calc.order_by.direcao}` : '';
        return `ROW_NUMBER() OVER (${part}${ord})`;
      }
      case 'agregacao': {
        if (calc.funcao === 'concat') {
          return `CONCAT(${calc.colunas.join(', ')})`;
        }
        if (calc.funcao === 'count_distinct') {
          return `COUNT(DISTINCT ${calc.colunas[0]})`;
        }
        return `${calc.funcao.toUpperCase()}(${calc.colunas[0]})`;
      }
      case 'operacao': {
        return `(${calc.colunas[0]} ${calc.operador} ${calc.colunas[1]})`;
      }
    }
  }

  /* ========================================================
   * LIMIT & PAYLOAD GENERATION
   * ======================================================== */

  public enforceLimitBounds(): void {
    if (this.limit === null || this.limit === undefined || isNaN(this.limit)) {
      this.limit = 100;
      return;
    }
    if (this.limit > this.maxLimit) {
      this.limit = this.maxLimit;
    } else if (this.limit < this.minLimit) {
      this.limit = this.minLimit;
    }
  }

  public generatePayload(): void {
    this.enforceLimitBounds();

    if (this.selectedColumns.length === 0 && this.calculatedColumns.length === 0) {
      this.validationError = 'Selecione ao menos 1 coluna no SELECT ou crie 1 coluna calculada antes de gerar o payload.';
      this.generatedPayload = null;
      return;
    }

    this.validationError = '';

    const joinsPayload: QueryPayloadJoin[] = this.activeJoins.map((j) => ({
      tipo: j.tipo,
      tabela: j.tabelaDestino,
      condicoes: j.condicoes.map((c) => ({
        coluna_origem: c.colunaOrigem,
        operador: c.operador || '=',
        coluna_destino: c.colunaDestino
      }))
    }));

    const payload: QueryPayload = {
      tabela: this.selectedTableId,
      ...(this.activeJoins.length > 0 ? { joins: joinsPayload } : {}),
      colunas: [...this.selectedColumns],
      filtros: JSON.parse(JSON.stringify(this.query)),
      limite: this.limit,
      geradoEm: new Date().toISOString()
    };

    if (this.calculatedColumns.length > 0) {
      payload.colunas_calculadas = JSON.parse(JSON.stringify(this.calculatedColumns));
    }

    if (this.hasAggregations) {
      payload.group_by = [...this.selectedColumns];
      if (this.havingQuery && this.havingQuery.rules && this.havingQuery.rules.length > 0) {
        payload.having = JSON.parse(JSON.stringify(this.havingQuery));
      }
    }

    this.generatedPayload = payload;
    this.sqlPreview = this.sqlPreviewService.generateSql(payload);
  }

  public copyPayloadToClipboard(): void {
    if (!this.generatedPayload) return;
    const jsonStr = JSON.stringify(this.generatedPayload, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      this.copyFeedback = true;
      setTimeout(() => {
        this.copyFeedback = false;
      }, 2500);
    });
  }

  public copySqlToClipboard(): void {
    if (!this.sqlPreview) return;
    navigator.clipboard.writeText(this.sqlPreview).then(() => {
      this.copySqlFeedback = true;
      setTimeout(() => {
        this.copySqlFeedback = false;
      }, 2500);
    });
  }
}
