import { Driver } from '../driver/driver.ts';
import { Client, ClientConfig } from 'mysql';
import { defaultNamingStrategy, NamingStrategy } from '../shared/naming-strategy.ts';
import { entityStore } from '../store/entity-store.ts';
import { Type } from '../shared/type.ts';
import { Repository } from '../repository/repository.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { informationSchemaNamingStrategy } from '../information-schema/information-schema-naming-strategy.ts';

export interface SyncOptions {
  dropUnknownTables?: boolean;
  dropUnkownColumns?: boolean;
  askBeforeSync?: boolean;
}

export interface ConnectionConfig extends ClientConfig {
  name?: string;
  namingStrategy?: NamingStrategy;
  sync?: boolean;
  syncOptions?: SyncOptions;
}

export class Connection {
  static async createConnection(config: ConnectionConfig): Promise<Connection> {
    config.name = config.name ?? 'default';
    config.namingStrategy = config.namingStrategy ?? defaultNamingStrategy;
    entityStore.updateDefaults(config.name, config.namingStrategy);
    const entitiesMap = entityStore.getEntitiesConnection(config.name);
    let informationSchemaConnection: Connection;
    let version: string;
    if (config.db !== 'information_schema') {
      informationSchemaConnection = await Connection.createConnection({
        ...config,
        namingStrategy: informationSchemaNamingStrategy,
        sync: false,
        name: 'information_schema',
        db: 'information_schema',
      });
    }
    const driver = new Driver(config, config.namingStrategy, entitiesMap, informationSchemaConnection!);
    const client = await driver.connect();
    if (config.sync) {
      await driver.sync();
    }
    if (config.db === 'information_schema') {
      version = (await client.query('select version()'))[0]['version()'];
    }
    return new Connection(config.name, driver, client, config, entitiesMap, version!);
  }

  static async createConnections(configs: ConnectionConfig[]): Promise<Record<string, Connection>> {
    const connections: Record<string, Connection> = {};
    for (const config of configs) {
      connections[config.name!] = await Connection.createConnection(config);
    }
    return connections;
  }

  constructor(
    private name: string,
    public driver: Driver,
    public client: Client,
    private options: ConnectionConfig,
    private entitiesMap: Map<any, EntityMetadata>,
    public version?: string
  ) {}

  async sync(): Promise<void> {
    await this.driver.sync();
  }

  async disconnect(): Promise<void> {
    await this.driver.disconnect();
  }

  getRepository<T>(entity: Type<T>): Repository<T> {
    if (!this.entitiesMap.has(entity)) {
      throw new Error(
        `Entity ${
          entity?.name ?? entity
        } doesn't exist in this connection\nDid you forget to decorate it with @Entity()?`
      );
    }
    return new Repository<T>(entity, this.entitiesMap.get(entity)!, this.driver);
  }
}
