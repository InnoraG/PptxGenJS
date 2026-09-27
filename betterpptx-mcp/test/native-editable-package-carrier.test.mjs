import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inspectEditableBoundary } from '../ir/native-editable-package-carrier.mjs';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const xy = (x) => '<a:xfrm><a:off x="' + x + '" y="200"/><a:ext cx="1000" cy="500"/></a:xfrm>';
const spPr = (x, color) => '<p:spPr>' + xy(x) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></p:spPr>';
const textShape = (name, id, x, value) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '" descr="description"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' + spPr(x,'336699') + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>' + value + '</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>';
const shape = (name,id,x,color) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' + spPr(x,color) + '</p:sp>';
const group = (name,id,x,color,childName) => '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="' + x + '" y="200"/><a:ext cx="1000" cy="500"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="500"/></a:xfrm></p:grpSpPr>' + shape(childName,id+1,25,color) + '</p:grpSp>';
const slide = (carrier) => '<p:sld xmlns:p="' + P + '" xmlns:a="' + A + '"><p:cSld><p:spTree>' + carrier + '</p:spTree></p:cSld></p:sld>';

async function fixture(carrierA,carrierB,{badRel=false}={}) {
  const z = new JSZip();
  z.file('[Content_Types].xml','<Types xmlns="' + CT + '"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide7.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  z.file('_rels/.rels','<Relationships xmlns="' + REL + '"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
  z.file('ppt/presentation.xml','<p:presentation xmlns:p="' + P + '" xmlns:r="' + R + '"><p:sldIdLst><p:sldId id="300" r:id="rId7"/><p:sldId id="301" r:id="rId2"/></p:sldIdLst></p:presentation>');
  z.file('ppt/_rels/presentation.xml.rels','<Relationships xmlns="' + REL + '"><Relationship Id="rId2" Type="' + R + '/slide" Target="slides/slide2.xml"/><Relationship Id="rId7" Type="' + R + '/slide" Target="slides/slide7.xml"/></Relationships>');
  z.file('ppt/slides/slide7.xml',slide(carrierA));
  z.file('ppt/slides/slide2.xml',slide(carrierB));
  z.file('ppt/slides/_rels/slide7.xml.rels','<Relationships xmlns="' + REL + '"><Relationship Id="rId99" Type="' + R + '/hyperlink" Target="' + (badRel ? '../media/missing.png' : '../slides/slide2.xml') + '"/></Relationships>');
  return z.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}

test('textShape endpoints bind by presentation order and ignore only top-level translation/name/id', async () => {
  const bytes = await fixture(textShape('alpha',2,10,'Same'),textShape('beta',8,900,'Same'));
  const proof = await inspectEditableBoundary(bytes,{boundaryId:'b-text',endpoints:[
    {side:'start',slideIndex:0,nativeKind:'textShape',objectName:'alpha',plannedEditHandle:'h1',operationIndex:4},
    {side:'end',slideIndex:1,nativeKind:'textShape',objectName:'beta',plannedEditHandle:'h2',operationIndex:5},
  ]});
  assert.equal(proof.endpointEquality,true);
  assert.equal(proof.authoredEquivalence,false);
  assert.deepEqual(proof.endpoints.map((x)=>x.slidePart),['ppt/slides/slide7.xml','ppt/slides/slide2.xml']);
  assert.deepEqual(proof.endpoints.map((x)=>x.cNvPrId),['2','8']);
});

test('in-memory dangling internal relationship rejects before digest comparison', async () => {
  const bytes = await fixture(textShape('alpha',2,10,'Same'),textShape('beta',8,900,'Same'),{badRel:true});
  await assert.rejects(inspectEditableBoundary(bytes,{boundaryId:'b-rel',endpoints:[
    {side:'start',slideIndex:0,nativeKind:'textShape',objectName:'alpha'},
    {side:'end',slideIndex:1,nativeKind:'textShape',objectName:'beta'},
  ]}),/REL_TARGET_MISSING_OR_UNTYPED/);
});

test('group endpoint equality preserves child style and child position', async () => {
  const options={boundaryId:'b-group',endpoints:[
    {side:'start',slideIndex:0,nativeKind:'group',objectName:'groupA',expectedChildren:[{name:'kidA'}]},
    {side:'end',slideIndex:1,nativeKind:'group',objectName:'groupB',expectedChildren:[{name:'kidB'}]},
  ]};
  const good = await fixture(group('groupA',3,10,'BB3300','kidA'),group('groupB',9,900,'BB3300','kidB'));
  assert.equal((await inspectEditableBoundary(good,options)).endpointEquality,true);
  const changedStyle = await fixture(group('groupA',3,10,'BB3300','kidA'),group('groupB',9,900,'00BB33','kidB'));
  await assert.rejects(inspectEditableBoundary(changedStyle,options),/PACKAGE_CARRIER_SEMANTIC_MISMATCH/);
});

test('in-memory semantic text change remains well-formed but rejects', async () => {
  const bytes = await fixture(textShape('alpha',2,10,'Same'),textShape('beta',8,900,'Different'));
  await assert.rejects(inspectEditableBoundary(bytes,{boundaryId:'b-text-change',endpoints:[
    {side:'start',slideIndex:0,nativeKind:'textShape',objectName:'alpha'},
    {side:'end',slideIndex:1,nativeKind:'textShape',objectName:'beta'},
  ]}),/PACKAGE_CARRIER_SEMANTIC_MISMATCH/);
});


