export class SqlUtil {
  static escape(name: string): string {
    return `\`${name}\``;
  }

  static replaceString(str: string): string {
    return str.replace(/'/g, `\\'`);
  }
}
