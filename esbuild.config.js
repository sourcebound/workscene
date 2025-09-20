// ESM sürüm
import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  external: ['vscode'],
  tsconfig: 'tsconfig.json',
  minify: true,
}

try {
  if (watch) {
    const ctx = await esbuild.context(buildOptions)
    await ctx.watch()
    console.log('Watching for changes...')
  } else {
    await esbuild.build(buildOptions)
  }
} catch (error) {
  console.error(error)
  process.exit(1)
}
