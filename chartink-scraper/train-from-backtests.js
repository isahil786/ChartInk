import { loadProbabilityTable, saveProbabilityTable, trainFromFormattedBacktests } from './src/probability.js';

function runTraining() {
  console.log('Training Probability Table from Formatted Backtests');
  console.log('==================================================\n');

  const table = loadProbabilityTable();
  console.log(`Before: ${table.metadata.totalSequences} sequences`);

  trainFromFormattedBacktests(table, {
    simple: true,
    progressEvery: 25,
    onProgress: (pipelineType, pct) => process.stdout.write(`\r  ${pipelineType}: ${pct}%`),
  });

  console.log('\n');
  console.log(`After: ${table.metadata.totalSequences} sequences`);
  console.log(`Trained at: ${table.metadata.formattedBacktestsTrainedAt}`);

  saveProbabilityTable(table);
  console.log('Saved to state/probability/lookup-table.json');
}

runTraining();