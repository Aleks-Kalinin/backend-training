import { Injectable } from '@nestjs/common';
import Piscina from 'piscina';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ConversionEngine,
  ConvertImageParams,
  ConvertTextParams,
} from '../application/ports/conversion-engine.port';

@Injectable()
export class PiscinaConversionEngine implements ConversionEngine {
  private readonly piscina = new Piscina({
    filename: path.resolve(__dirname, './workers/conversion.worker.js'),
    maxThreads: Math.max(1, Math.floor(os.cpus().length / 2)),
  });

  convertText({
    buffer,
    originalFormat,
    targetFormat,
    signal,
  }: ConvertTextParams) {
    return this.piscina.run(
      { buffer, originalFormat, targetFormat },
      { name: 'convertTextFile', signal },
    ) as Promise<string>;
  }

  convertImage({
    buffer,
    originalFormat,
    targetFormat,
    options,
    signal,
  }: ConvertImageParams) {
    return this.piscina.run(
      { buffer, originalFormat, targetFormat, options },
      { name: 'convertImageFile', signal },
    ) as Promise<Buffer>;
  }

  close() {
    return this.piscina.destroy();
  }
}
