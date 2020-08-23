import { Column } from '../entity/column.ts';
import { Entity } from '../entity/entity.ts';
import { Tables } from './tables.entity.ts';
import { ManyToOne } from '../entity/many-to-one.ts';
import { JoinColumn } from '../entity/join-column.ts';

@Entity({ connection: 'information_schema', sync: false })
export class Columns {
  @Column() TABLE_CATALOG!: string;
  @Column() TABLE_SCHEMA!: string;
  @Column({ primary: true }) TABLE_NAME!: string;
  @Column({ primary: true }) COLUMN_NAME!: string;
  @Column() ORDINAL_POSITION!: number;
  @Column() COLUMN_DEFAULT!: string;
  @Column() IS_NULLABLE!: string;
  @Column() DATA_TYPE!: string;
  @Column() CHARACTER_MAXIMUM_LENGTH?: number;
  @Column() CHARACTER_OCTET_LENGTH?: number;
  @Column() NUMERIC_PRECISION?: number;
  @Column() NUMERIC_SCALE?: number;
  @Column() DATETIME_PRECISION?: number;
  @Column() CHARACTER_SET_NAME!: string;
  @Column() COLLATION_NAME!: string;
  @Column() COLUMN_TYPE!: string;
  @Column() COLUMN_KEY!: string;
  @Column() EXTRA!: string;
  @Column() PRIVILEGES!: string;
  @Column() COLUMN_COMMENT!: string;
  @Column() GENERATION_EXPRESSION!: string;

  @ManyToOne(() => Tables, 'columns')
  @JoinColumn([
    { name: 'TABLE_NAME', referencedColumn: 'TABLE_NAME' },
    { name: 'TABLE_SCHEMA', referencedColumn: 'TABLE_SCHEMA' },
  ])
  table!: Tables;
}
