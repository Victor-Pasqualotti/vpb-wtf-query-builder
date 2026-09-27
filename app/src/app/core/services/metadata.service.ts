import { Injectable } from '@angular/core';
import { QueryBuilderConfig } from 'angular2-query-builder';
import { TableDefinition } from '../models/query-builder.model';

@Injectable({
  providedIn: 'root'
})
export class MetadataService {
  private readonly tables: TableDefinition[] = [
    {
      id: 'vendas_2023',
      name: 'Vendas 2023 (vendas_2023)',
      description: 'Histórico consolidado de transações, pedidos e faturamento do ano de 2023.',
      icon: '🛒',
      columns: [
        {
          name: 'venda_id',
          label: 'ID da Venda',
          type: 'number',
          description: 'Identificador único do pedido'
        },
        {
          name: 'cliente_id',
          label: 'ID do Cliente',
          type: 'string',
          description: 'Código de identificação do cliente comprador'
        },
        {
          name: 'valor_total',
          label: 'Valor Total (R$)',
          type: 'number',
          description: 'Montante total pago no pedido'
        },
        {
          name: 'data_compra',
          label: 'Data da Compra',
          type: 'date',
          description: 'Data em que o pedido foi emitido'
        },
        {
          name: 'canal_venda',
          label: 'Canal de Venda',
          type: 'category',
          description: 'Canal em que a compra foi realizada',
          options: [
            { name: 'E-commerce Web', value: 'ecommerce' },
            { name: 'App Mobile', value: 'app_mobile' },
            { name: 'Loja Física', value: 'loja_fisica' },
            { name: 'Marketplace', value: 'marketplace' }
          ]
        },
        {
          name: 'status_pagamento',
          label: 'Status do Pagamento',
          type: 'category',
          description: 'Situação financeira da transação',
          options: [
            { name: 'Aprovado', value: 'aprovado' },
            { name: 'Pendente', value: 'pendente' },
            { name: 'Cancelado', value: 'cancelado' },
            { name: 'Estornado', value: 'estornado' }
          ]
        },
        {
          name: 'quantidade_itens',
          label: 'Qtd. Itens',
          type: 'number',
          description: 'Número de itens no carrinho'
        }
      ]
    },
    {
      id: 'clientes_ativos',
      name: 'Clientes Ativos (clientes_ativos)',
      description: 'Base cadastral com informações de contato, localização e status de clientes.',
      icon: '👥',
      columns: [
        {
          name: 'cliente_id',
          label: 'ID do Cliente',
          type: 'string',
          description: 'Identificador único do cliente'
        },
        {
          name: 'nome_completo',
          label: 'Nome Completo',
          type: 'string',
          description: 'Nome registrado do cliente'
        },
        {
          name: 'email',
          label: 'E-mail',
          type: 'string',
          description: 'Endereço de e-mail verificado'
        },
        {
          name: 'cidade',
          label: 'Cidade',
          type: 'string',
          description: 'Município de residência'
        },
        {
          name: 'uf_estado',
          label: 'Estado (UF)',
          type: 'category',
          description: 'Unidade Federativa',
          options: [
            { name: 'São Paulo (SP)', value: 'SP' },
            { name: 'Rio de Janeiro (RJ)', value: 'RJ' },
            { name: 'Minas Gerais (MG)', value: 'MG' },
            { name: 'Rio Grande do Sul (RS)', value: 'RS' },
            { name: 'Paraná (PR)', value: 'PR' },
            { name: 'Bahia (BA)', value: 'BA' }
          ]
        },
        {
          name: 'pontos_fidelidade',
          label: 'Pontos Fidelidade',
          type: 'number',
          description: 'Saldo de pontos acumulados no programa'
        },
        {
          name: 'data_cadastro',
          label: 'Data de Cadastro',
          type: 'date',
          description: 'Data em que a conta foi criada'
        },
        {
          name: 'vip',
          label: 'Cliente VIP',
          type: 'boolean',
          description: 'Indica se pertence à categoria VIP'
        }
      ]
    },
    {
      id: 'log_eventos',
      name: 'Logs de Eventos (log_eventos)',
      description: 'Registro de telemetria, interações de usuários e eventos de navegação.',
      icon: '⚡',
      columns: [
        {
          name: 'evento_id',
          label: 'UUID do Evento',
          type: 'string',
          description: 'Identificador único do evento'
        },
        {
          name: 'usuario_id',
          label: 'ID do Usuário',
          type: 'string',
          description: 'Código da sessão ou usuário autenticado'
        },
        {
          name: 'tipo_evento',
          label: 'Tipo de Evento',
          type: 'category',
          description: 'Categoria da ação executada',
          options: [
            { name: 'Page View', value: 'page_view' },
            { name: 'Click Button', value: 'click' },
            { name: 'Search Query', value: 'search' },
            { name: 'Add to Cart', value: 'add_to_cart' },
            { name: 'Checkout Complete', value: 'checkout' },
            { name: 'Error Encountered', value: 'error' }
          ]
        },
        {
          name: 'dispositivo',
          label: 'Dispositivo',
          type: 'category',
          description: 'Form factor do dispositivo de acesso',
          options: [
            { name: 'Desktop', value: 'desktop' },
            { name: 'Mobile', value: 'mobile' },
            { name: 'Tablet', value: 'tablet' }
          ]
        },
        {
          name: 'duracao_ms',
          label: 'Duração (ms)',
          type: 'number',
          description: 'Tempo de carregamento ou resposta da requisição'
        },
        {
          name: 'timestamp_evento',
          label: 'Data do Evento',
          type: 'date',
          description: 'Horário UTC de captura do registro'
        },
        {
          name: 'sucesso',
          label: 'Sucesso',
          type: 'boolean',
          description: 'Status de sucesso da operação'
        }
      ]
    }
  ];

  getTables(): TableDefinition[] {
    return this.tables;
  }

  getTableById(id: string): TableDefinition | undefined {
    return this.tables.find((t) => t.id === id);
  }

  getQueryBuilderConfig(tableId: string): QueryBuilderConfig {
    const table = this.getTableById(tableId);
    if (!table) {
      return { fields: {} };
    }

    const fieldsConfig: Record<string, any> = {};

    for (const col of table.columns) {
      fieldsConfig[col.name] = {
        name: `${col.label} (${col.name})`,
        type: col.type,
        options: col.options || []
      };
    }

    return {
      fields: fieldsConfig
    };
  }
}
