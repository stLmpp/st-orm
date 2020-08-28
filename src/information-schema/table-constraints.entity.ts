import { Entity } from '../entity/entity.ts';
import { Column } from '../entity/column.ts';
import { ManyToOne } from '../entity/many-to-one.ts';
import { Tables } from './tables.entity.ts';
import { JoinColumn, JoinColumnOptions } from '../entity/join-column.ts';
import { OneToMany } from '../entity/one-to-many.ts';
import { KeyColumnUsage } from './key-column-usage.entity.ts';

@Entity({ connection: 'information_schema', sync: false })
export class TableConstraints {
  @Column({ primary: true }) CONSTRAINT_CATALOG!: string;
  @Column({ primary: true }) CONSTRAINT_SCHEMA!: string;
  @Column({ primary: true }) CONSTRAINT_NAME!: string;
  @Column({ primary: true }) TABLE_SCHEMA!: string;
  @Column({ primary: true }) TABLE_NAME!: string;
  @Column({ primary: true }) CONSTRAINT_TYPE!: string;

  REFERENCED_TABLE_NAME?: string;

  @ManyToOne(() => Tables, 'constraints')
  @JoinColumn([
    {
      name: 'TABLE_SCHEMA',
      referencedColumn: 'TABLE_SCHEMA',
    },
    {
      name: 'TABLE_NAME',
      referencedColumn: 'TABLE_NAME',
    },
  ])
  table!: Tables;

  @OneToMany(() => KeyColumnUsage, 'tableConstraint')
  keyColumnUsages!: KeyColumnUsage[];

  getJoinColumns(): JoinColumnOptions[] {
    return (this.keyColumnUsages ?? []).map(keyColumnUsage => {
      return {
        name: keyColumnUsage.COLUMN_NAME,
        referencedColumn: keyColumnUsage.REFERENCED_COLUMN_NAME,
      };
    });
  }
}
