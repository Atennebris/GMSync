import * as fs from 'fs';
import * as path from 'path';
import { writeAtomicText } from './writeAtomic';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'ShaderCreator';

const DEFAULT_FSH = `//
// Simple passthrough fragment shader
//
varying vec2 v_vTexcoord;
varying vec4 v_vColour;

void main()
{
    gl_FragColor = v_vColour * texture2D( gm_BaseTexture, v_vTexcoord );
}
`;

const DEFAULT_VSH = `//
// Simple passthrough vertex shader
//
attribute vec3 in_Position;                  // (x,y,z)
//attribute vec3 in_Normal;                  // (x,y,z)     unused in this shader.
attribute vec4 in_Colour;                    // (r,g,b,a)
attribute vec2 in_TextureCoord;              // (u,v)

varying vec2 v_vTexcoord;
varying vec4 v_vColour;

void main()
{
    vec4 object_space_pos = vec4( in_Position.x, in_Position.y, in_Position.z, 1.0);
    gl_Position = gm_Matrices[MATRIX_WORLD_VIEW_PROJECTION] * object_space_pos;

    v_vColour = in_Colour;
    v_vTexcoord = in_TextureCoord;
}
`;

/**
 * Создаёт новый шейдер GMS2:
 *  - shaders/{name}/{name}.yy   — метаданные (type=1 → GLSL ES, кросс-платформ)
 *  - shaders/{name}/{name}.fsh  — фрагментный шейдер (default passthrough)
 *  - shaders/{name}/{name}.vsh  — вертексный шейдер (default passthrough)
 *  - Регистрирует в .yyp
 */
export async function createShader(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const shaderDir = path.join(projectRoot, 'shaders', name);
  const yyPath = path.join(shaderDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Shader already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const yyTemplate: Record<string, unknown> = {
    '$GMShader': '',
    '%Name': name,
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    resourceType: 'GMShader',
    resourceVersion: '2.0',
    type: 1, // GLSL ES — кросс-платформенный тип по умолчанию
  };

  try {
    fs.mkdirSync(shaderDir, { recursive: true });
    writeGms2Json(yyPath, yyTemplate);
    writeAtomicText(path.join(shaderDir, `${name}.fsh`), DEFAULT_FSH);
    writeAtomicText(path.join(shaderDir, `${name}.vsh`), DEFAULT_VSH);

    await registerResource(yypPath, {
      name,
      relativePath: `shaders/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Shader created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create shader', { name, error: String(e) });
    try { fs.rmSync(shaderDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
