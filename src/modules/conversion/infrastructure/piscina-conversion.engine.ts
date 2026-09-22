import { Injectable } from '@nestjs/common';
import Piscina from 'piscina';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConversionEngine } from '../application/ports/conversion-engine.port';
import { ImageConversionOptions } from '../domain/image-conversion-options';

@Injectable()
export class PiscinaConversionEngine implements ConversionEngine {
  private readonly piscina = new Piscina({
    filename: path.resolve(__dirname, './workers/conversion.worker.js'),
    maxThreads: Math.max(1, Math.floor(os.cpus().length / 2)),
  });

  convertText(
    buffer: Buffer,
    originalFormat: string,
    targetFormat: string,
    signal?: AbortSignal,
  ) {
    return this.piscina.run(
      { buffer, originalFormat, targetFormat },
      { name: 'convertTextFile', signal },
    ) as Promise<string>;
  }

  convertImage(
    buffer: Buffer,
    originalFormat: string,
    targetFormat: string,
    options: ImageConversionOptions,
    signal?: AbortSignal,
  ) {
    return this.piscina.run(
      { buffer, originalFormat, targetFormat, options },
      { name: 'convertImageFile', signal },
    ) as Promise<Buffer>;
  }

  close(): Promise<void> {
    return this.piscina.destroy();
  }
}
