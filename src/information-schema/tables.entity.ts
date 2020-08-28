import { Entity } from '../entity/entity.ts';
import { Column } from '../entity/column.ts';
import { Columns } from './columns.entity.ts';
import { OneToMany } from '../entity/one-to-many.ts';
import { TableConstraints } from './table-constraints.entity.ts';

export enum TableRowFormat {
  fixed = 'Fixed',
  dynamic = 'Dynamic',
  compressed = 'Compressed',
  redundant = 'Redundant',
  compact = 'Compact',
  paged = 'Paged',
}

export enum TableType {
  baseTable = 'BASE TABLE',
  view = 'VIEW',
  systemView = 'SYSTEM VIEW',
}

@Entity({ connection: 'information_schema', sync: false })
export class Tables {
  @Column() TABLE_CATALOG!: string;
  @Column() TABLE_SCHEMA!: string;
  @Column({ primary: true }) TABLE_NAME!: string;
  @Column({ enumValue: TableType }) TABLE_TYPE!: TableType;
  @Column() ENGINE!: string;
  @Column() VERSION?: number;
  @Column({ enumValue: TableType }) ROW_FORMAT!: TableRowFormat;
  @Column() TABLE_ROWS?: number;
  @Column() AVG_ROW_LENGTH?: number;
  @Column() DATA_LENGTH?: number;
  @Column() MAX_DATA_LENGTH: any;
  @Column() INDEX_LENGTH?: number;
  @Column() DATA_FREE?: number;
  @Column() AUTO_INCREMENT?: number;
  @Column() CREATE_TIME!: Date;
  @Column() UPDATE_TIME!: Date;
  @Column() CHECK_TIME!: Date;
  @Column() TABLE_COLLATION!: string;
  @Column() CHECKSUM?: number;
  @Column() CREATE_OPTIONS!: string;
  @Column() TABLE_COMMENT!: string;

  @OneToMany(() => Columns, 'table')
  columns!: Columns[];

  @OneToMany(() => TableConstraints, 'table')
  constraints!: TableConstraints[];

  getPrimaries(): string[] {
    return (this.columns ?? []).filter(col => col.COLUMN_KEY === 'PRI').map(col => col.COLUMN_NAME);
  }
}
