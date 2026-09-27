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
});
