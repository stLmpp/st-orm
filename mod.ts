import './src/injector/reflect.ts';
// TODO check if reflection is working correctly
// import 'https://cdn.pika.dev/@abraham/reflection@^0.7.0';
import { Application } from 'oak';
import { Connection } from './src/connection/connection.ts';
import { DB_CONFIG } from './test/db.config.ts';
import { Column, PrimaryGeneratedColumn } from './src/entity/column.ts';
import { Entity } from './src/entity/entity.ts';
import { Index, Indices, UniqueIndex } from './src/entity/indices.ts';
import { OneToOne } from './src/entity/one-to-one.ts';
import { JoinColumn } from './src/entity/join-column.ts';
import { ManyToOne } from './src/entity/many-to-one.ts';
import { OneToMany } from './src/entity/one-to-many.ts';
import { ManyToMany } from './src/entity/many-to-many.ts';
import { JoinTable } from './src/entity/join-table.ts';

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

@Indices(['index2', 'index1'])
@Entity()
export class Perfil {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nome!: string;

  @Column({ length: 1000 })
  @Index({ fulltext: true, comment: 'BLABLABLA' })
  fullName!: string;

  @Column()
  date!: Date;

  @Column({ enumValue: Teste })
  teste!: Teste;

  @OneToOne(() => User, { eager: true })
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

  @OneToMany(() => SubGrupo, 'grupo', { eager: true })
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

  @ManyToOne(() => Perfil, { eager: true })
  @JoinColumn()
  perfil!: Perfil;
}

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nome!: string;

  @ManyToMany(() => Mode, 'games', { eager: true })
  @JoinTable()
  modes!: Mode[];

  @OneToOne(() => GameSettings, 'game', { eager: true })
  gameSettings!: GameSettings;
}

@Entity()
export class GameSettings {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nome!: string;

  @OneToOne(() => Game, 'gameSettings')
  @JoinColumn()
  game!: Game;
}

@Entity()
export class Mode {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nome!: string;

  @OneToMany(() => SubMode, 'mode', { eager: true })
  subModes!: SubMode[];

  @ManyToMany(() => Game, 'modes')
  games!: Game[];
}

@Entity()
export class SubMode {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nome!: string;

  @Column()
  idMode!: number;

  @ManyToOne(() => Mode, 'subModes')
  @JoinColumn()
  mode!: Mode;
}

const app = new Application();
const connection = await Connection.createConnection({ ...DB_CONFIG, sync: false });

const repo = connection.getRepository(Grupo);

await repo.findOne({ where: { nome: 'Grupo', subGrupos: { nome: 'SubGrupo', perfil: { nome: 'Perfil' } } } });

console.log(repo.createSelectQueryBuilder('g').includeEagerRelations().getQuery());

/*console.log(await qb.getMany());*/

/*const qb = connection.driver.informationSchemaService.tableRepository
  .createQueryBuilder('t')
  .andWhere('t.table_schema = :schema', { schema: 'orcamento' })
  .innerJoinAndSelect('t.columns', 'c');
await qb.getOne();*/
/*
const routes = new Router();
routes
  .get('/game', async context => {
    context.response.body = await connection.getRepository(Game).createQueryBuilder('g').getMany();
  })
  .get('/game/:idGame', async context => {
    const idGame = +context.params.idGame!;
    context.response.body = await connection
      .getRepository(Game)
      .createQueryBuilder('g')
      .andWhere('g.id = ?', [idGame])
      .getOne();
  });

app.use(routes.routes());
app.use(routes.allowedMethods());
await app.listen({ port: 3000 });*/
