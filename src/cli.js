const fs = require('node:fs');
const path = require('node:path');
const { encryptText, decryptPayload, DEFAULT_ITERATIONS } = require('./encryption');

const printHelp = () => {
  const help = `hugo-protector

Usage:
  hugo-protector encrypt [options]

Options:
  -i, --input <file>         Read plaintext from a file (defaults to stdin)
  -t, --text <string>        Use provided string as plaintext (overrides --input)
  -p, --password <value>     Provide password directly (discouraged)
      --password-file <file> Read password from file (preferred)
  -m, --mode <shortcode|page> Output helper snippet for mode (default: shortcode)
      --iterations <number>  Override PBKDF2 iterations (default: ${DEFAULT_ITERATIONS})
  -o, --output <file>        Write payload/snippet to file instead of stdout
      --format <raw|helper>  raw = base64 payload only, helper = mode-specific snippet (default: helper)
  -h, --help                 Show this message

Examples:
  hugo-protector encrypt -i secret.html --password-file .pwd
  hugo-protector encrypt --text "<p>snippet</p>" -p mypass -m page --format raw
`;
  console.log(help);
};

const parseArgs = argv => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('-')) {
      const next = argv[i + 1];
      switch (token) {
        case '-i':
        case '--input':
          args.input = next;
          i += 1;
          break;
        case '-t':
        case '--text':
          args.text = next;
          i += 1;
          break;
        case '-p':
        case '--password':
          args.password = next;
          i += 1;
          break;
        case '--password-file':
          args.passwordFile = next;
          i += 1;
          break;
        case '-m':
        case '--mode':
          args.mode = next;
          i += 1;
          break;
        case '--iterations':
          args.iterations = Number(next);
          i += 1;
          break;
        case '-o':
        case '--output':
          args.output = next;
          i += 1;
          break;
        case '--format':
          args.format = next;
          i += 1;
          break;
        case '-h':
        case '--help':
          args.help = true;
          break;
        default:
          throw new Error(`Unknown flag: ${token}`);
      }
    } else {
      args._.push(token);
    }
  }
  return args;
};

const readPassword = args => {
  if (args.password) {
    return args.password;
  }
  if (args.passwordFile) {
    return fs.readFileSync(path.resolve(args.passwordFile), 'utf8').trim();
  }
  if (process.env.HUGO_PROTECTOR_PASSWORD) {
    return process.env.HUGO_PROTECTOR_PASSWORD;
  }
  throw new Error('Password not provided. Use --password-file or set HUGO_PROTECTOR_PASSWORD.');
};

const readInput = args => {
  if (args.text !== undefined) {
    return Promise.resolve(args.text);
  }
  if (args.input) {
    return Promise.resolve(fs.readFileSync(path.resolve(args.input), 'utf8'));
  }
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
};

const renderHelper = (mode, payload) => {
  if (mode === 'page') {
    return `# front matter snippet\nprotector_full_page_payload: "${payload}"`;
  }
  return `{{< protector payload="${payload}" >}}`;
};

const writeOutput = (args, content) => {
  if (args.output) {
    fs.writeFileSync(path.resolve(args.output), content, 'utf8');
    return;
  }
  process.stdout.write(`${content}\n`);
};

const run = async (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.help || args._[0] === 'help' || argv.length === 0) {
    printHelp();
    return;
  }

  const command = args._[0] || 'encrypt';
  if (command !== 'encrypt') {
    throw new Error(`Unsupported command: ${command}`);
  }

  const plaintext = (await readInput(args)).trim();
  if (!plaintext) {
    throw new Error('No plaintext provided.');
  }
  const password = readPassword(args);
  const payload = encryptText(plaintext, password, { iterations: args.iterations });

  const format = args.format || 'helper';
  const mode = args.mode || 'shortcode';
  const content = format === 'raw' ? payload : renderHelper(mode, payload);
  writeOutput(args, content);
};

module.exports = { run };
