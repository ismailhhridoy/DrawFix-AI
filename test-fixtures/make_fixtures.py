import ezdxf
# A small apartment floor drawn the way a typical office draws it:
# mm units, walls as LINEs on "WALLS", door blocks "D900"/"D800" on "DOORS",
# room names as MTEXT on "ROOM NAMES", NO room boundary polylines, no metadata text.
doc = ezdxf.new("R2010"); doc.header["$INSUNITS"] = 4
msp = doc.modelspace()
for n in ["WALLS","DOORS","ROOM NAMES","WINDOWS","DIMS"]: doc.layers.add(n)
for name,w in [("D900",900),("D800",800),("MAIN-ENTRY-1000",1000)]:
    b = doc.blocks.new(name); b.add_line((0,0),(w,0)); b.add_arc((0,0),w,0,90)
wb = doc.blocks.new("W1200"); wb.add_line((0,0),(1200,0))
def wall(x1,y1,x2,y2): msp.add_line((x1,y1),(x2,y2),dxfattribs={"layer":"WALLS"})
def hwall(y,x1,x2,gaps=()):
    xs=[x1]
    for g,w in gaps: xs+= [g-w/2,g+w/2]
    xs.append(x2)
    for i in range(0,len(xs),2): wall(xs[i],y,xs[i+1],y)
def vwall(x,y1,y2,gaps=()):
    ys=[y1]
    for g,w in gaps: ys+= [g-w/2,g+w/2]
    ys.append(y2)
    for i in range(0,len(ys),2): wall(x,ys[i],x,ys[i+1])
W,H=14000,10000
hwall(0,0,W,[(6000,1000)])      # south wall, main entry
hwall(H,0,W); vwall(0,0,H); vwall(W,0,H)
hwall(4000,0,W,[(2500,900),(6000,900),(11500,900)])   # corridor south side
hwall(5400,0,W,[(2500,900),(9000,800),(12500,900)])   # corridor north side (1.4m corridor)
vwall(5000,0,4000); vwall(9000,0,4000,[(2000,900)])
vwall(5000,5400,H); vwall(10500,5400,H)
vwall(7000,0,4000)  # splits entry lobby? leave gap at bottom
def door(name,x,y,rot=0): msp.add_blockref(name,(x,y),dxfattribs={"layer":"DOORS","rotation":rot})
door("MAIN-ENTRY-1000",6000,0)
for x in (2500,6000,11500): door("D900",x,4000)
door("D900",2500,5400); door("D800",9000,5400); door("D900",12500,5400); door("D900",9000,2000,90)
def label(t,x,y): msp.add_mtext(t,dxfattribs={"layer":"ROOM NAMES","char_height":250,"insert":(x,y)})
label("Bedroom 1",2500,2000); label("Living / Dining",6000,2000); label("Kitchen",8000,3000); label("Bedroom 2",11500,2000)
label("Master Bed",2500,7700); label("Family Lounge",7700,7700); label("Store",12300,7700); label("Passage",7000,4700)
for x,y in [(2500,H),(7700,H),(2500,0),(11500,0)]: msp.add_blockref("W1200",(x,y),dxfattribs={"layer":"WINDOWS"})
msp.add_linear_dim(base=(7000,4700),p1=(1000,4000),p2=(1000,5400),angle=90,dxfattribs={"layer":"DIMS"}).render()
doc.saveas("foreign_apartment.dxf")
print("ok")
