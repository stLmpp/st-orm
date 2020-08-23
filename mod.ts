import './src/injector/reflect.ts';
// import 'https://cdn.pika.dev/@abraham/reflection@^0.7.0';
import { Application } from 'oak';
import { Connection } from './src/connection/connection.ts';
import { DB_CONFIG } from './test/db.config.ts';
import { Column, PrimaryGeneratedColumn } from './src/entity/column.ts';
import { Entity } from './src/entity/entity.ts';
import { Index, Indexes, UniqueIndex } from './src/entity/indexes.ts';
import { OneToOne } from './src/entity/one-to-one.ts';
import { JoinColumn } from './src/entity/join-column.ts';
import { ManyToOne } from './src/entity/many-to-one.ts';
import { OneToMany } from './src/entity/one-to-many.ts';

enum Teste {
  teste = 'testeSAAS',
  teste2 = 'asdasd',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nome!: string;
}

@Indexes(['index2', 'index1'])
@Entity()
export class Perfil {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nome!: string;

  @Column({ length: 1000 })
  @Index({ fulltext: true })
  fullName!: string;

  @Column()
  date!: Date;

  @Column({ enumValue: Teste })
  teste!: Teste;

  @OneToOne(() => User)
  @JoinColumn()
  user!: User;

  @Column()
  index1!: number;

  @Column()
  index2!: number;

  @Column()
  index3!: number;

  @Column()
  @UniqueIndex({ comment: 'Teste' })
  codigo!: string;

  @Column()
  teste1!: number;
}

@Entity()
export class Grupo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  dataCriacao!: Date;

  @Column({ nullable: true })
  dataAtualizacao?: Date;

  @Column()
  nome!: string;

  @Column()
  descricao!: string;

  @Column({ unique: true })
  codigo!: string;

  @OneToMany(() => SubGrupo, 'grupo')
  subGrupos!: SubGrupo[];
}

@Entity()
export class SubGrupo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  dataCriacao!: Date;

  @Column({ nullable: true })
  dataAtualizacao?: Date;

  @Column()
  nome!: string;

  @Column()
  descricao!: string;

  @Column({ length: 10, unique: true })
  codigo!: string;

  @Column()
  idGrupo!: number;

  @ManyToOne(() => Grupo, 'subGrupos')
  @JoinColumn()
  grupo!: Grupo;
}

const app = new Application();
const connection = await Connection.createConnection(DB_CONFIG);

/*const qb = connection.driver.informationSchemaService.tableRepository
  .createQueryBuilder('t')
  .andWhere('t.table_schema = :schema', { schema: 'orcamento' })
  .innerJoinAndSelect('t.columns', 'c');
await qb.getOne();*/

/*const routes = new Router();
routes
  .get('/grupo', async context => {
    context.response.body = await connection.query('select * from grupo');
  })
  .get('/grupo/:idGrupo', async context => {
    const idGrupo = +context.params.idGrupo!;
    const query = 'select * from grupo where id = ?';
    context.response.body = await connection.query(query, [idGrupo]);
  });

app.use(routes.routes());
app.use(routes.allowedMethods());
await app.listen({ port: 3000 });*/
