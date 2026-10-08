import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnswerService } from './answerService.js';
import { createApp } from './app.js';
import { loadCampusInfo } from './campusInfo.js';
import { loadEnvFile, readConfig } from './config.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  loadEnvFile(path.join(projectDir, '.env'));
  const config = readConfig(process.env, projectDir);
  const info = await loadCampusInfo(config.infoFile);
  const answerService = createAnswerService({ info, llm: config.llm });
  const server = createApp({
    publicDir: path.join(projectDir, 'public'),
    suggestions: info.suggestions,
    answerQuestion: answerService,
  });

  server.on('error', (error) => {
    console.error(`CampusBuddy could not listen on port ${config.port}: ${error.message}`);
    process.exit(1);
  });
  server.listen(config.port, config.host, () => {
    console.log(`CampusBuddy is running at http://localhost:${config.port}`);
    console.log(
      config.llm
        ? `Answers: AI model "${config.llm.model}", with keyword matching as a backup.`
        : 'Answers: built-in keyword matching. Set LLM_API_KEY to use an AI model.',
    );
    console.log(`Campus info: ${path.relative(projectDir, config.infoFile) || config.infoFile}`);
  });
} catch (error) {
  console.error(`CampusBuddy could not start: ${error.message}`);
  process.exit(1);
}
