import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { MetadataService } from './core/services/metadata.service';
import { SqlPreviewService } from './core/services/sql-preview.service';

describe('App (Athena Visual Query Builder)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [MetadataService, SqlPreviewService]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should initialize with 3 fictional tables', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    expect(app.tables.length).toBe(3);
    const tableIds = app.tables.map((t) => t.id);
    expect(tableIds).toContain('vendas_2023');
    expect(tableIds).toContain('clientes_ativos');
    expect(tableIds).toContain('log_eventos');
  });

  it('should update columns and config dynamically when table changes', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    // Default table: vendas_2023
    expect(app.selectedTableId).toBe('vendas_2023');
    expect(app.availableColumns.length).toBeGreaterThanOrEqual(4);

    // Change to clientes_ativos
    app.onTableChange('clientes_ativos');
    expect(app.selectedTableId).toBe('clientes_ativos');
    expect(app.availableColumns.length).toBeGreaterThanOrEqual(4);
    expect(app.queryConfig.fields['nome_completo']).toBeDefined();

    // Change to log_eventos
    app.onTableChange('log_eventos');
    expect(app.selectedTableId).toBe('log_eventos');
    expect(app.availableColumns.length).toBeGreaterThanOrEqual(4);
    expect(app.queryConfig.fields['evento_id']).toBeDefined();
  });

  it('should enforce limit bounds between 1 and 1000', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.limit = 5000;
    app.enforceLimitBounds();
    expect(app.limit).toBe(1000);

    app.limit = -10;
    app.enforceLimitBounds();
    expect(app.limit).toBe(1);

    app.limit = 250;
    app.enforceLimitBounds();
    expect(app.limit).toBe(250);
  });

  it('should generate a valid QueryPayload with structured AST JSON', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.generatePayload();
    expect(app.generatedPayload).toBeTruthy();
    expect(app.generatedPayload?.tabela).toBe('vendas_2023');
    expect(app.generatedPayload?.colunas.length).toBeGreaterThan(0);
    expect(app.generatedPayload?.limite).toBe(100);
    expect(app.generatedPayload?.filtros).toBeDefined();
    expect(app.sqlPreview).toContain('SELECT');
    expect(app.sqlPreview).toContain('FROM\n  vendas_2023');
    expect(app.sqlPreview).toContain('LIMIT 100');
  });

  it('should support creating a ROW_NUMBER calculated column with PARTITION BY and ORDER BY', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.calcType = 'row_number';
    app.rowNumAlias = 'posicao_compra';
    app.rowNumPartitionBy = ['cliente_id'];
    app.rowNumOrderCol = 'data_compra';
    app.rowNumOrderDir = 'DESC';

    app.addCalculatedColumn();
    expect(app.calculatedColumns.length).toBe(1);
    expect(app.calculatedColumns[0].tipo).toBe('row_number');

    app.generatePayload();
    expect(app.generatedPayload?.colunas_calculadas?.length).toBe(1);
    expect(app.sqlPreview).toContain('ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY data_compra DESC) AS "posicao_compra"');
  });

  it('should support creating an AGGREGATE calculated column, requiring GROUP BY and enabling HAVING', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    // Select standard grouping columns
    app.selectedColumns = ['cliente_id', 'canal_venda'];

    app.calcType = 'agregacao';
    app.aggFunc = 'sum';
    app.aggCol = 'valor_total';
    app.aggAlias = 'faturamento_total';

    app.addCalculatedColumn();
    expect(app.calculatedColumns.length).toBe(1);
    expect(app.hasAggregations).toBe(true);
    expect(app.havingConfig.fields['faturamento_total']).toBeDefined();

    // Set a rule in HAVING
    app.havingQuery = {
      condition: 'and',
      rules: [
        { field: 'faturamento_total', operator: '>', value: 500 }
      ]
    };

    app.generatePayload();
    expect(app.generatedPayload?.group_by).toEqual(['cliente_id', 'canal_venda']);
    expect(app.generatedPayload?.having).toBeDefined();
    expect(app.sqlPreview).toContain('SUM(valor_total) AS "faturamento_total"');
    expect(app.sqlPreview).toContain('GROUP BY\n  cliente_id, canal_venda');
    expect(app.sqlPreview).toContain('HAVING\n  faturamento_total > 500');
  });

  it('should support creating a MATH / EXPRESSION calculated column (+, -, =)', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.calcType = 'operacao';
    app.mathOp = '-';
    app.mathCol1 = 'valor_total';
    app.mathCol2 = 'quantidade_itens';
    app.mathAlias = 'diferenca_metrica';

    app.addCalculatedColumn();
    expect(app.calculatedColumns.length).toBe(1);

    app.generatePayload();
    expect(app.sqlPreview).toContain('(valor_total - quantidade_itens) AS "diferenca_metrica"');
  });

  it('should prevent generating payload if no columns and no calculated columns are selected', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.clearAllColumns();
    app.calculatedColumns = [];
    app.generatePayload();

    expect(app.generatedPayload).toBeNull();
    expect(app.validationError).toContain('Selecione ao menos 1 coluna');
  });

  it('should support JOIN journey: selecting base table, choosing to use variables from other tables, and configuring LEFT JOIN with ON condition', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    // 1. Tabela de partida: vendas_2023
    expect(app.selectedTableId).toBe('vendas_2023');

    // 2. Deseja usar variáveis de outras tabelas? Sim (2.1)
    app.onWantsJoinsChange(true);
    expect(app.wantsJoins).toBe(true);
    expect(app.availableJoinTables.map((t) => t.id)).toContain('clientes_ativos');
    expect(app.availableJoinTables.map((t) => t.id)).toContain('log_eventos');

    // Configura LEFT JOIN com clientes_ativos
    app.selectedJoinType = 'LEFT JOIN';
    app.selectedJoinTableId = 'clientes_ativos';
    app.currentJoinConditions = [
      {
        colunaOrigem: 'vendas_2023.cliente_id',
        operador: '=',
        colunaDestino: 'clientes_ativos.cliente_id'
      }
    ];

    app.addJoin();
    expect(app.activeJoins.length).toBe(1);
    expect(app.activeJoins[0].tipo).toBe('LEFT JOIN');
    expect(app.activeJoins[0].tabelaDestino).toBe('clientes_ativos');

    // Verifica que colunas de ambas as tabelas estão disponíveis para seleção
    const tableGroups = app.activeTableGroups;
    expect(tableGroups.length).toBe(2);
    expect(tableGroups[0].table.id).toBe('vendas_2023');
    expect(tableGroups[1].table.id).toBe('clientes_ativos');

    // Seleciona colunas de ambas as tabelas
    app.selectedColumns = ['vendas_2023.valor_total', 'clientes_ativos.nome_completo', 'clientes_ativos.cidade'];

    // Filtra no WHERE usando coluna da tabela joined
    app.query = {
      condition: 'and',
      rules: [
        {
          field: 'clientes_ativos.cidade',
          operator: '=',
          value: 'Campinas'
        }
      ]
    };

    // Gera o payload
    app.generatePayload();

    expect(app.generatedPayload?.joins?.length).toBe(1);
    expect(app.generatedPayload?.joins?.[0].tipo).toBe('LEFT JOIN');
    expect(app.generatedPayload?.joins?.[0].tabela).toBe('clientes_ativos');
    expect(app.generatedPayload?.joins?.[0].condicoes[0].coluna_origem).toBe('vendas_2023.cliente_id');
    expect(app.generatedPayload?.joins?.[0].condicoes[0].coluna_destino).toBe('clientes_ativos.cliente_id');

    // Verifica o SQL Trino/Athena compilado
    expect(app.sqlPreview).toContain('FROM\n  vendas_2023');
    expect(app.sqlPreview).toContain('LEFT JOIN clientes_ativos\n  ON vendas_2023.cliente_id = clientes_ativos.cliente_id');
    expect(app.sqlPreview).toContain('clientes_ativos.cidade = \'Campinas\'');
  });

  it('should support multi-table calculated columns across joined tables', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    // Ativa JOIN com clientes_ativos
    app.onWantsJoinsChange(true);
    app.selectedJoinType = 'INNER JOIN';
    app.selectedJoinTableId = 'clientes_ativos';
    app.currentJoinConditions = [
      {
        colunaOrigem: 'vendas_2023.cliente_id',
        operador: '=',
        colunaDestino: 'clientes_ativos.cliente_id'
      }
    ];
    app.addJoin();

    // Cria coluna calculada operando entre coluna de vendas_2023 e coluna de clientes_ativos
    app.calcType = 'operacao';
    app.mathOp = '+';
    app.mathCol1 = 'vendas_2023.valor_total';
    app.mathCol2 = 'clientes_ativos.pontos_fidelidade';
    app.mathAlias = 'total_com_pontos';

    app.addCalculatedColumn();
    expect(app.calculatedColumns.length).toBe(1);

    app.generatePayload();
    expect(app.sqlPreview).toContain('INNER JOIN clientes_ativos\n  ON vendas_2023.cliente_id = clientes_ativos.cliente_id');
    expect(app.sqlPreview).toContain('(vendas_2023.valor_total + clientes_ativos.pontos_fidelidade) AS "total_com_pontos"');
  });

  it('should allow removing a configured JOIN and reset back to base table when disabled', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.onWantsJoinsChange(true);
    app.selectedJoinType = 'LEFT JOIN';
    app.selectedJoinTableId = 'clientes_ativos';
    app.currentJoinConditions = [
      {
        colunaOrigem: 'vendas_2023.cliente_id',
        operador: '=',
        colunaDestino: 'clientes_ativos.cliente_id'
      }
    ];
    app.addJoin();
    expect(app.activeJoins.length).toBe(1);

    // Remove o JOIN
    app.removeJoin(0);
    expect(app.activeJoins.length).toBe(0);

    // Desliga a opção de JOINs (2.2 Não)
    app.onWantsJoinsChange(false);
    expect(app.wantsJoins).toBe(false);
    expect(app.activeTableIds).toEqual(['vendas_2023']);
  });
});
