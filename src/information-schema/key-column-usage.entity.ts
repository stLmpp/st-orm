import { Entity } from '../entity/entity.ts';
import { Column } from '../entity/column.ts';
import { ManyToOne } from '../entity/many-to-one.ts';
import { TableConstraints } from './table-constraints.entity.ts';
import { JoinColumn } from '../entity/join-column.ts';

@Entity({ connection: 'information_schema', sync: false })
export class KeyColumnUsage {
  @Column({ primary: true }) CONSTRAINT_CATALOG!: string;
  @Column({ primary: true }) CONSTRAINT_SCHEMA!: string;
  @Column({ primary: true }) CONSTRAINT_NAME!: string;
  @Column({ primary: true }) TABLE_CATALOG!: string;
  @Column({ primary: true }) TABLE_SCHEMA!: string;
  @Column({ primary: true }) TABLE_NAME!: string;
  @Column({ primary: true }) COLUMN_NAME!: string;
  @Column() ORDINAL_POSITION!: number;
  @Column() POSITION_IN_UNIQUE_CONSTRAINT!: number;
  @Column() REFERENCED_TABLE_SCHEMA!: string;
  @Column() REFERENCED_TABLE_NAME!: string;
  @Column() REFERENCED_COLUMN_NAME!: string;

  @ManyToOne(() => TableConstraints, 'keyColumnUsages')
  @JoinColumn([
    {
      name: 'CONSTRAINT_SCHEMA',
      referencedColumn: 'CONSTRAINT_SCHEMA',
    },
    {
      name: 'CONSTRAINT_NAME',
      referencedColumn: 'CONSTRAINT_NAME',
    },
  ])
  tableConstraint!: TableConstraints;
}
