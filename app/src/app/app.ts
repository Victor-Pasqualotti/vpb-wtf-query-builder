import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QueryBuilderConfig, QueryBuilderModule, RuleSet } from 'angular2-query-builder';
import { ColumnDefinition, QueryPayload, TableDefinition } from './core/models/query-builder.model';
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

  // 3. Filtros (WHERE)
  public queryConfig: QueryBuilderConfig = { fields: {} };
  public query: RuleSet = {
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

  /**
   * Responde dinamicamente à alteração da tabela selecionada (FROM):
   * - Atualiza a lista de colunas disponíveis
   * - Atualiza a configuração do QueryBuilder (WHERE) com os novos campos e tipos
   * - Reinicializa a seleção de colunas e regras padrão
   */
  public onTableChange(tableId: string, isInitial = false): void {
    this.selectedTableId = tableId;
    const table = this.metadataService.getTableById(tableId);

    if (!table) {
      return;
    }

    this.availableColumns = table.columns;

    // Seleciona as colunas principais por padrão (ou todas)
    if (isInitial) {
      this.selectedColumns = ['cliente_id', 'valor_total', 'data_compra', 'canal_venda'];
    } else {
      this.selectedColumns = table.columns.slice(0, 4).map((c) => c.name);
    }

    // Atualiza dinamicamente a configuração do query-builder
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

    // Limpa erro e atualiza payload se já havia sido gerado
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
  }

  /**
   * Verifica se a coluna está selecionada
   */
  public isColumnSelected(columnName: string): boolean {
    return this.selectedColumns.includes(columnName);
  }

  /**
   * Seleciona todas as colunas da tabela atual
   */
  public selectAllColumns(): void {
    this.selectedColumns = this.availableColumns.map((c) => c.name);
  }

  /**
   * Desmarca todas as colunas da tabela atual
   */
  public clearAllColumns(): void {
    this.selectedColumns = [];
  }

  /**
   * Validação de limites para garantir segurança de custos no Athena
   */
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

  /**
   * 5. Gera o objeto JSON estruturado (Payload / AST)
   */
  public generatePayload(): void {
    this.enforceLimitBounds();

    if (this.selectedColumns.length === 0) {
      this.validationError = 'Selecione ao menos 1 coluna para compor a consulta antes de gerar o payload.';
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

    this.generatedPayload = payload;
    this.sqlPreview = this.sqlPreviewService.generateSql(payload);
  }

  /**
   * Copia o JSON gerado para a área de transferência com feedback visual
   */
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

  /**
   * Copia o SQL de preview para a área de transferência
   */
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
