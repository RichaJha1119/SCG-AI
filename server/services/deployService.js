import archiver from 'archiver';
import { Writable } from 'stream';

const API_VERSION = '62.0';

function getLwcBundleName(comp) {
  const raw = comp.bundle || comp.name || 'component';
  return String(raw).replace(/\.(html|js|css|xml)$/i, '');
}

function generatePackageXml(components) {
  const types = {};

  for (const comp of components) {
    if (comp.type === 'ApexClass' || comp.type === 'ApexTestClass') {
      (types['ApexClass'] = types['ApexClass'] || new Set()).add(comp.name);
    } else if (comp.type === 'ApexTrigger') {
      (types['ApexTrigger'] = types['ApexTrigger'] || new Set()).add(comp.name);
    } else if (comp.type.startsWith('LWC_')) {
      const lwcName = getLwcBundleName(comp);
      (types['LightningComponentBundle'] = types['LightningComponentBundle'] || new Set()).add(lwcName);
    }
  }

  const typesXml = Object.entries(types)
    .map(([typeName, members]) => `    <types>\n${[...members].map(m => `        <members>${m}</members>`).join('\n')}\n        <name>${typeName}</name>\n    </types>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${typesXml}\n    <version>${API_VERSION}</version>\n</Package>`;
}

function getMetaXml(type) {
  if (type === 'ApexClass' || type === 'ApexTestClass') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">\n    <apiVersion>${API_VERSION}</apiVersion>\n    <status>Active</status>\n</ApexClass>`;
  }
  if (type === 'ApexTrigger') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<ApexTrigger xmlns="http://soap.sforce.com/2006/04/metadata">\n    <apiVersion>${API_VERSION}</apiVersion>\n    <status>Active</status>\n</ApexTrigger>`;
  }
  return null;
}

export async function createDeploymentPackage(generatedData) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const output = new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
    });
    output.on('finish', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    archive.pipe(output);

    const { components } = generatedData;
    archive.append(generatePackageXml(components), { name: 'package.xml' });

    for (const comp of components) {
      const { type, name, content } = comp;
      const lwcBundle = getLwcBundleName(comp);

      if (type === 'ApexClass' || type === 'ApexTestClass') {
        archive.append(content, { name: `classes/${name}.cls` });
        archive.append(getMetaXml(type), { name: `classes/${name}.cls-meta.xml` });
      } else if (type === 'ApexTrigger') {
        archive.append(content, { name: `triggers/${name}.trigger` });
        archive.append(getMetaXml(type), { name: `triggers/${name}.trigger-meta.xml` });
      } else if (type === 'LWC_HTML') {
        archive.append(content, { name: `lwc/${lwcBundle}/${lwcBundle}.html` });
      } else if (type === 'LWC_JS') {
        archive.append(content, { name: `lwc/${lwcBundle}/${lwcBundle}.js` });
      } else if (type === 'LWC_CSS') {
        archive.append(content, { name: `lwc/${lwcBundle}/${lwcBundle}.css` });
      } else if (type === 'LWC_META') {
        archive.append(content, { name: `lwc/${lwcBundle}/${lwcBundle}.js-meta.xml` });
      } else if (type === 'Documentation') {
        archive.append(content, { name: `docs/${name}.md` });
      }
    }

    archive.finalize();
  });
}

export async function deployToSalesforce(conn, generatedData) {
  const zipBuffer = await createDeploymentPackage(generatedData);

  const deployResult = await conn.metadata.deploy(zipBuffer, {
    rollbackOnError: true,
    singlePackage: true,
    checkOnly: false,
  });

  let result;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    result = await conn.metadata.checkDeployStatus(deployResult.id, true);
    if (result.done) break;
  }

  return result;
}
