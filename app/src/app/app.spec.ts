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

  it('should prevent generating payload if no columns are selected', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.clearAllColumns();
    app.generatePayload();

    expect(app.generatedPayload).toBeNull();
    expect(app.validationError).toContain('Selecione ao menos 1 coluna');
  });
});
