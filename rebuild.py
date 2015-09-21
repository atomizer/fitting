# this script generates dyes.js and sheets.js
# make sure Objects.xml is in the current directory
# and appropriate PNG files are in ./sheets/

import sys, re, os, json
from base64 import b64encode
from glob import glob

try:
    from lxml import etree
except ImportError:
    try:
        import xml.etree.cElementTree as etree
    except ImportError:
        try:
            import xml.etree.ElementTree as etree
        except ImportError:
            try:
                import cElementTree as etree
            except ImportError:
                try:
                    import elementtree.ElementTree as etree
                except ImportError:
                    print("failed to import ElementTree")
                    sys.exit(1)


objects = etree.parse('Objects.xml')


# dyes.js

out = open('dyes.js', 'w')
out.write('var dyes = {\n')

desc = []

for item in objects.getroot():
    cl = item.find('Class')
    tx = item.find('Tex1')
    if cl is None or cl.text != 'Dye' or tx is None:
        continue
    id = item.get('id')
    id = re.sub('^(Large |Small )', '', id)
    id = re.sub('( Cloth| Clothing Dye| Accessory Dye)$', '', id)
    type = int(item.get('type'), 0) - 0x1000
    tx = int(tx.text, 0)
    size = tx >> 24
    tx -= size << 24
    if size == 1:
        flavour = '#{:06x}'.format(tx)
    else:
        flavour = tx
    desc.append("{0}: [{1}, {2}, {3}]".format(type, repr(id), size, repr(flavour)))

out.write(',\n'.join(desc) + '\n}\n')

# sheets.js

out = open('sheets.js', 'w')
out.write('var sheets = {\n')

sh = []

os.chdir('sheets')
for name in glob('*.png'):
    with open(name, 'rb') as f:
        content = f.read()
    name = re.sub('\.png$', '', name)
    sh.append("{0}: 'data:image/png;base64,{1}'".format(name, b64encode(content)))

out.write(',\n'.join(sh) + '\n}\n')


# skins.js

classes = {}
skins = {}


def getAnimTexture(tree):
    return {
        'file': tree.xpath('AnimatedTexture/File')[0].text,
        'index': int(tree.xpath('AnimatedTexture/Index')[0].text, 0)
    }

os.chdir('..')

for obj in objects.xpath('Object/Skin'):
    obj = obj.getparent()
    skdesc = getAnimTexture(obj)
    skdesc['id'] = obj.get('id')
    t = int(obj.xpath('PlayerClassType')[0].text, 0)
    if (not t in skins):
        skins[t] = []
    skins[t].append(skdesc)

for obj in objects.xpath('Object/Player'):
    p = obj.getparent()
    t = int(p.get('type'), 0)
    tex = getAnimTexture(p)
    tex['id'] = p.get('id')
    tex['skins'] = skins[t]
    classes[t] = tex

out = open('skins.js', 'w')
out.write('skins = ' + json.dumps(classes, separators=(',', ': '),
                                  indent=2, sort_keys=True))
