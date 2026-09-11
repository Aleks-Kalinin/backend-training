import { ImageFileFormat } from '../../domain/image-file-format.enum';
import { TextFileFormat } from '../../domain/text-file-format.enum';

// export const CONVERSION_MATRIX = {
//     [TextFileFormat.CSV]: {
//         [TextFileFormat.JSON]: (data: any) => JSON.stringify(data),
//         [TextFileFormat.XML]: (data: any) => new XMLBuilder().build(data),
//         [TextFileFormat.YAML]: (data: any) => yaml.stringify(data),
//     },
//     [TextFileFormat.JSON]: {
//         [TextFileFormat.CSV]: (data: any) => stringifyCsv(data, { header: true }),
//         [TextFileFormat.XML]: (data: any) => new XMLBuilder().build(data),
//         [TextFileFormat.YAML]: (data: any) => yaml.stringify(data),
//     },
//     [TextFileFormat.XML]: {
//         [TextFileFormat.CSV]: (data: any) => stringifyCsv(data, { header: true }),
//         [TextFileFormat.JSON]: (data: any) => JSON.stringify(data),
//         [TextFileFormat.YAML]: (data: any) => yaml.stringify(data),
//     },
//     [TextFileFormat.YAML]: {
//         [TextFileFormat.CSV]: (data: any) => stringifyCsv(data, { header: true }),
//         [TextFileFormat.JSON]: (data: any) => JSON.stringify(data),
//         [TextFileFormat.XML]: (data: any) => new XMLBuilder().build(data),
//     },
// }
