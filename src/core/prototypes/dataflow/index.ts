// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as Dataset from "../../dataset";
import * as Expression from "../../expression";
import * as Specification from "../../specification";

export class DataflowTableGroupedContext implements Expression.Context {
  public table: DataflowTable;
  public indices: number[];

  constructor(table: DataflowTable, indices: number[]) {
    this.table = table;
    this.indices = indices;
  }

  public getVariable(name: string) {
    if (this.table.rows[this.indices[0]].hasOwnProperty(name)) {
      return this.indices.map(i => this.table.rows[i][name]);
    }
    return this.table.getVariable(name);
  }
}

export class DataflowTable implements Expression.Context {
  constructor(
    public parent: DataflowManager,
    public name: string,
    public rows: Specification.DataRow[]
  ) {}

  /** Implements Expression.Context */
  public getVariable(name: string) {
    if (name == "rows") {
      return this.rows;
    }
    return this.parent.getVariable(name);
  }

  /** Get a row with index */
  public getRow(index: number): Specification.DataRow {
    return this.rows[index];
  }

  /** Get a row context with index */
  public getRowContext(index: number): Expression.Context {
    return new Expression.ShadowContext(this, this.rows[index]);
  }

  public getGroupedContext(rowIndices: number[]): Expression.Context {
    return new DataflowTableGroupedContext(this, rowIndices);
  }
}

export class DataflowManager implements Expression.Context {
  private tables: Map<string, DataflowTable>;

  public readonly context: Dataset.DatasetContext;
  public readonly cache: Expression.ExpressionCache;

  constructor(dataset: Dataset.Dataset) {
    this.context = new Dataset.DatasetContext(dataset);
    this.cache = new Expression.ExpressionCache();

    this.tables = new Map<string, DataflowTable>();
    for (const table of dataset.tables) {
      const dfTable = new DataflowTable(this, table.name, table.rows);
      this.tables.set(table.name, dfTable);
    }
  }

  /** Get a table by name (either original table or derived table) */
  public getTable(name: string): DataflowTable {
    return this.tables.get(name);
  }

  /** Implements Expression.Context */
  public getVariable(name: string) {
    if (this.tables.has(name)) {
      return this.tables.get(name).rows;
    }
  }
}
