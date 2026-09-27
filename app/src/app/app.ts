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
  MathCalculatedColumn,
  MathOperator,
  QueryPayload,
  RowNumberCalculatedColumn,
  TableDefinition
} from './core/models/query-builder.model';
import { MetadataService } from './core/services/metadata.service';
import { SqlPreviewService } from './core/services/sql-preview.service';

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

  get numericColumns(): ColumnDefinition[] {
    return this.availableColumns.filter((c) => c.type === 'number');
  }

  get hasAggregations(): boolean {
    return this.calculatedColumns.some((c) => c.tipo === 'agregacao');
  }

  get groupByColumns(): string[] {
    return this.hasAggregations ? [...this.selectedColumns] : [];
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

    this.availableColumns = table.columns;

    // Seleciona as colunas principais por padrão (ou primeiras 4)
    if (isInitial) {
      this.selectedColumns = ['cliente_id', 'valor_total', 'data_compra', 'canal_venda'];
    } else {
      this.selectedColumns = table.columns.slice(0, 4).map((c) => c.name);
    }

    // Reseta colunas calculadas ao mudar de tabela
    this.calculatedColumns = [];
    this.resetCalculatedColumnForm();

    // Atualiza dinamicamente a configuração do query-builder (WHERE)
    this.queryConfig = this.metadataService.getQueryBuilderConfig(tableId);

    // Reseta/inicializa a árvore de regras com uma regra inicial relevante
    const firstCol = table.columns[0];
    this.query = {
      condition: 'and',
      rules: [
        {
          field: firstCol.name,
          operator: firstCol.type === 'number' ? '>=' : '=',
          value: firstCol.type === 'number' ? 0 : ''
        }
      ]
    };

    // Atualiza HAVING config
    this.updateHavingConfig();

    this.validationError = '';
    if (this.generatedPayload) {
      this.generatePayload();
    }
  }

  /**
   * Alterna a seleção de uma coluna específica
   */
  public toggleColumn(columnName: string): void {
    const index = this.selectedColumns.indexOf(columnName);
    if (index > -1) {
      this.selectedColumns.splice(index, 1);
    } else {
      this.selectedColumns.push(columnName);
    }
    this.updateHavingConfig();
  }

  public isColumnSelected(columnName: string): boolean {
    return this.selectedColumns.includes(columnName);
  }

  public selectAllColumns(): void {
    this.selectedColumns = this.availableColumns.map((c) => c.name);
    this.updateHavingConfig();
  }

  public clearAllColumns(): void {
    this.selectedColumns = [];
    this.updateHavingConfig();
  }

  /* ========================================================
   * MÉTODOS DE COLUNAS CALCULADAS
   * ======================================================== */

  public resetCalculatedColumnForm(): void {
    this.calcFormError = '';
    const numCols = this.numericColumns;
    const allCols = this.availableColumns;

    this.rowNumAlias = `num_linha_${this.calculatedColumns.length + 1}`;
    this.rowNumPartitionBy = [];
    this.rowNumOrderCol = allCols[0]?.name || '';
    this.rowNumOrderDir = 'ASC';

    this.aggFunc = 'sum';
    this.aggCol = numCols[0]?.name || allCols[0]?.name || '';
    this.aggConcatCols = [allCols[0]?.name || '', allCols[1]?.name || ''];
    this.aggAlias = `total_${this.aggFunc}_${this.calculatedColumns.length + 1}`;

    this.mathOp = '+';
    this.mathCol1 = numCols[0]?.name || allCols[0]?.name || '';
    this.mathCol2 = numCols[1]?.name || allCols[1]?.name || allCols[0]?.name || '';
    this.mathAlias = `calc_${this.calculatedColumns.length + 1}`;
  }

  public onAggFuncChange(): void {
    const numCols = this.numericColumns;
    const allCols = this.availableColumns;

    if (this.aggFunc === 'sum' || this.aggFunc === 'avg') {
      this.aggCol = numCols[0]?.name || allCols[0]?.name || '';
    } else if (this.aggFunc === 'concat') {
      if (this.aggConcatCols.length === 0) {
        this.aggConcatCols = allCols.slice(0, 2).map((c) => c.name);
      }
    } else {
      this.aggCol = allCols[0]?.name || '';
    }
    this.aggAlias = `${this.aggFunc}_${this.aggCol || 'col'}`;
  }

  public togglePartitionBy(colName: string): void {
    const idx = this.rowNumPartitionBy.indexOf(colName);
    if (idx > -1) {
      this.rowNumPartitionBy.splice(idx, 1);
    } else {
      this.rowNumPartitionBy.push(colName);
    }
  }

  public isPartitionBySelected(colName: string): boolean {
    return this.rowNumPartitionBy.includes(colName);
  }

  public toggleConcatCol(colName: string): void {
    const idx = this.aggConcatCols.indexOf(colName);
    if (idx > -1) {
      this.aggConcatCols.splice(idx, 1);
    } else {
      this.aggConcatCols.push(colName);
    }
  }

  public isConcatColSelected(colName: string): boolean {
    return this.aggConcatCols.includes(colName);
  }

  /**
   * Adiciona uma nova coluna calculada
   */
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

  /**
   * Remove uma coluna calculada
   */
  public removeCalculatedColumn(index: number): void {
    this.calculatedColumns.splice(index, 1);
    this.updateHavingConfig();
    if (this.generatedPayload) {
      this.generatePayload();
    }
  }

  /**
   * Atualiza a configuração do HAVING com base nas agregações ativas
   */
  public updateHavingConfig(): void {
    if (!this.hasAggregations) {
      this.havingConfig = { fields: {} };
      this.havingQuery = { condition: 'and', rules: [] };
      return;
    }

    const fieldsConfig: Record<string, any> = {};

    // Adiciona as colunas calculadas de agregação disponíveis para filtragem no HAVING
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

    // Se o HAVING ainda estiver vazio, inicializa com a primeira agregação disponível
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

    const payload: QueryPayload = {
      tabela: this.selectedTableId,
      colunas: [...this.selectedColumns],
      filtros: JSON.parse(JSON.stringify(this.query)),
      limite: this.limit,
      geradoEm: new Date().toISOString()
    };

    // Inclui colunas calculadas se houver
    if (this.calculatedColumns.length > 0) {
      payload.colunas_calculadas = JSON.parse(JSON.stringify(this.calculatedColumns));
    }

    // Se houver agregações, inclui GROUP BY e HAVING
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
