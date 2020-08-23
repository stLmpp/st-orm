import { Entity } from '../entity/entity.ts';
import { Column } from '../entity/column.ts';

@Entity({ connection: 'information_schema', sync: false })
export class Statistics {
  @Column() TABLE_CATALOG!: string;
  @Column({ primary: true }) TABLE_SCHEMA!: string;
  @Column({ primary: true }) TABLE_NAME!: string;
  @Column() NON_UNIQUE!: number;
  @Column() INDEX_SCHEMA!: string;
  @Column({ primary: true }) INDEX_NAME!: string;
  @Column() SEQ_IN_INDEX!: number;
  @Column({ primary: true }) COLUMN_NAME!: string;
  @Column() COLLATION!: string;
  @Column() CARDINALITY?: number;
  @Column() SUB_PART?: number;
  @Column() PACKED?: string;
  @Column() NULLABLE!: string;
  @Column() INDEX_TYPE!: string;
  @Column() COMMENT!: string;
  @Column() INDEX_COMMENT!: string;
  @Column({ select: false }) IS_VISIBLE?: 'YES' | 'NO';
  @Column({ select: false }) EXPRESSION?: string;
}
