"""Build a code-native PSN-HUB icon matching the Manager leaf and purple/green theme."""
from pathlib import Path
import math,struct,zlib,binascii
root=Path(__file__).resolve().parents[1];out=root/'native/build';out.mkdir(parents=True,exist_ok=True)
size=512;pixels=bytearray(size*size*4);shapes=[]
def polygon(points,color):
 shapes.append((points,color))
 for y in range(max(0,int(min(p[1] for p in points))),min(size,math.ceil(max(p[1] for p in points))+1)):
  edges=[]
  for i,(x1,y1) in enumerate(points):
   x2,y2=points[(i+1)%len(points)]
   if (y1<=y+.5<y2) or (y2<=y+.5<y1):edges.append(x1+(y+.5-y1)*(x2-x1)/(y2-y1))
  edges.sort()
  for i in range(0,len(edges)-1,2):
   for x in range(max(0,math.ceil(edges[i]-.5)),min(size,math.ceil(edges[i+1]-.5))):pixels[(y*size+x)*4:(y*size+x)*4+4]=bytes(color)
# Rounded tile, with the same green as the site.
for y in range(size):
 for x in range(size):
  dx=max(64-x,0,x-447);dy=max(64-y,0,y-447)
  if dx*dx+dy*dy<=64*64:
   edge=x<7 or x>504 or y<7 or y>504 or (dx or dy) and dx*dx+dy*dy>57*57
   pixels[(y*size+x)*4:(y*size+x)*4+4]=bytes((57,255,20,255) if edge else (31,7,51,255))
for tx,ty in [(-25,5),(-30,-14),(-18,-33),(0,-47),(18,-33),(30,-14),(25,5)]:
 dx,dy=tx,ty-14;length=math.hypot(dx,dy);nx,ny=-dy/length,dx/length;breadth=5 if abs(tx)>24 else 6;points=[(0,14)]
 for side in [1,-1]:
  for i in range(1,13):
   t=i/12 if side==1 else 1-i/12;spread=math.sin(math.pi*t)*breadth*(1 if i%2 else .55)*side;points.append((dx*t+nx*spread,14+dy*t+ny*spread))
 polygon([(256+x*2.9,190+y*2.9) for x,y in points],(57,255,20,255))
polygon([(253,225),(259,225),(259,277),(253,277)],(57,255,20,255))
glyphs={'P':['11110','10001','10001','11110','10000','10000','10000'],'S':['01111','10000','10000','01110','00001','00001','11110'],'N':['10001','11001','11001','10101','10011','10011','10001'],'H':['10001','10001','10001','11111','10001','10001','10001'],'U':['10001','10001','10001','10001','10001','10001','01110'],'B':['11110','10001','10001','11110','10001','10001','11110']}
for text,top in [('PSN',290),('HUB',390)]:
 for char_index,char in enumerate(text):
  for row,line in enumerate(glyphs[char]):
   for col,value in enumerate(line):
    if value=='1':
     x,y=154+char_index*72+col*12,top+row*12;polygon([(x,y),(x+12,y),(x+12,y+12),(x,y+12)],(255,255,255,255))
def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',binascii.crc32(name+data)&0xffffffff)
raw=b''.join(b'\0'+pixels[y*size*4:(y+1)*size*4] for y in range(size))
image=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
(out/'psn-hub-icon.png').write_bytes(image)
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">','<rect x="3.5" y="3.5" width="505" height="505" rx="60" fill="#1f0733" stroke="#39ff14" stroke-width="7"/>']
for points,color in shapes:svg.append('<polygon points="'+' '.join(f'{x:.3f},{y:.3f}' for x,y in points)+'" fill="'+('#39ff14' if color[0]==57 else '#fff')+'"/>')
svg.append('</svg>');(out/'psn-hub-icon.svg').write_text('\n'.join(svg),encoding='utf-8')
print('Generated 512x512 PSN-HUB PNG and SVG:',len(image),'bytes')

(out/"shortcut_icon.h").write_text('#define SHORTCUT_ICON_SHA256 "'+__import__("hashlib").sha256(image).hexdigest()+'"\n',encoding="ascii")
