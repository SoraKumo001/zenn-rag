export interface IEmbeddingProvider {
  readonly name: string;
  readonly model: string;

  getEmbedding(text: string): Promise<number[]>;

  getEmbeddings(
    texts: string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<number[][]>;
}
