/*
 * aep2json.jsx  -  After Effects -> JSON exporter
 *
 * Dumps the active (or selected) composition, and every pre-comp it
 * references, to a JSON file: layer types, transforms, blend modes,
 * track mattes, shape-layer vector trees, text documents, masks,
 * effects, and full keyframe data. Intended input for an AE->Fusion
 * (or ->Remotion) translator - it does not transform coordinates, it
 * records raw AE values plus each comp's dimensions so a consumer can.
 *
 * RUN
 *   After Effects: File > Scripts > Run Script File...  -> pick this file.
 *   (or drop it in the Scripts folder to get it in the menu)
 *   Preferences > Scripting & Expressions >
 *     "Allow Scripts to Write Files and Access Network"  must be ON.
 *
 * OUTPUT
 *   You pick the path in a save dialog. Structure:
 *   {
 *     exporter, generatedFrom, ae, rootCompId,
 *     comps: { "<id>": { name,id,width,height,pixelAspect,frameRate,
 *                        duration,bgColor,workAreaStart,workAreaDuration,
 *                        layers: [ ... ] } }
 *   }
 *   Every animatable value is { value: <at t=0> } and, when keyed,
 *   also { keys: [ { t, v, inType, outType, inEase, outEase, inTan, outTan } ] }.
 *   Freeform paths: { _shape: true, closed, vertices, inTangents, outTangents }.
 *   Text: { _textDocument: true, text, font, fontSize, fillColor, ... }.
 */

(function () {
  // ---------- generic helpers -------------------------------------------
  function enumName(enumObj, val) {
    try {
      for (var k in enumObj) {
        if (enumObj[k] === val) return k;
      }
    } catch (e) {}
    return String(val);
  }

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return null;
    }
  }

  function finiteOr(n, alt) {
    return typeof n === "number" && isFinite(n) ? n : alt;
  }

  function cloneArray(a) {
    var out = [];
    for (var i = 0; i < a.length; i++) {
      var v = a[i];
      if (v instanceof Array) out.push(cloneArray(v));
      else if (typeof v === "number") out.push(finiteOr(v, 0));
      else out.push(v);
    }
    return out;
  }

  // ---------- value normalisation --------------------------------------
  function textDocObject(td) {
    return {
      _textDocument: true,
      text: safe(function () { return td.text; }),
      font: safe(function () { return td.font; }),
      fontSize: safe(function () { return td.fontSize; }),
      applyFill: safe(function () { return td.applyFill; }),
      fillColor: safe(function () { return td.applyFill ? cloneArray(td.fillColor) : null; }),
      applyStroke: safe(function () { return td.applyStroke; }),
      strokeColor: safe(function () { return td.applyStroke ? cloneArray(td.strokeColor) : null; }),
      strokeWidth: safe(function () { return td.applyStroke ? td.strokeWidth : null; }),
      justification: safe(function () { return enumName(ParagraphJustification, td.justification); }),
      tracking: safe(function () { return td.tracking; }),
      leading: safe(function () { return td.leading; }),
      boxText: safe(function () { return td.boxText; }),
      boxTextSize: safe(function () { return td.boxText ? cloneArray(td.boxTextSize) : null; }),
      baselineShift: safe(function () { return td.baselineShift; })
    };
  }

  function normalize(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Shape) {
      return {
        _shape: true,
        closed: v.closed,
        vertices: cloneArray(v.vertices),
        inTangents: cloneArray(v.inTangents),
        outTangents: cloneArray(v.outTangents)
      };
    }
    if (typeof TextDocument !== "undefined" && v instanceof TextDocument) {
      return textDocObject(v);
    }
    if (v instanceof MarkerValue) {
      return { _marker: true, comment: safe(function () { return v.comment; }) };
    }
    if (v instanceof Array) return cloneArray(v);
    if (typeof v === "number") return finiteOr(v, null);
    if (typeof v === "boolean" || typeof v === "string") return v;
    return String(v);
  }

  // ---------- property + keyframes ------------------------------------
  function readKeys(prop) {
    var keys = [];
    for (var i = 1; i <= prop.numKeys; i++) {
      var k = { t: prop.keyTime(i), v: normalize(prop.keyValue(i)) };
      try {
        k.inType = enumName(KeyframeInterpolationType, prop.keyInInterpolationType(i));
        k.outType = enumName(KeyframeInterpolationType, prop.keyOutInterpolationType(i));
      } catch (e) {}
      try {
        var ie = prop.keyInTemporalEase(i), oe = prop.keyOutTemporalEase(i);
        k.inEase = easeArray(ie);
        k.outEase = easeArray(oe);
      } catch (e) {}
      try {
        var vt = prop.propertyValueType;
        if (vt === PropertyValueType.TwoD_SPATIAL || vt === PropertyValueType.ThreeD_SPATIAL) {
          k.inTan = cloneArray(prop.keyInSpatialTangent(i));
          k.outTan = cloneArray(prop.keyOutSpatialTangent(i));
        }
      } catch (e) {}
      keys.push(k);
    }
    return keys;
  }

  function easeArray(eases) {
    var out = [];
    for (var i = 0; i < eases.length; i++) {
      out.push({ speed: finiteOr(eases[i].speed, 0), influence: finiteOr(eases[i].influence, 0) });
    }
    return out;
  }

  function serializeProperty(prop) {
    if (!prop) return null;
    var o = { name: prop.name, matchName: prop.matchName };
    try {
      if (prop.canSetExpression && prop.expressionEnabled && prop.expression) {
        o.expression = prop.expression;
      }
    } catch (e) {}
    try {
      if (prop.numKeys && prop.numKeys > 0) {
        o.keys = readKeys(prop);
        o.value = normalize(prop.valueAtTime(0, true));
      } else {
        o.value = normalize(prop.value);
      }
    } catch (e) {
      o.error = String(e);
    }
    return o;
  }

  function serializeGroup(group, maxDepth) {
    var o = { name: group.name, matchName: group.matchName, _group: true, props: [] };
    try {
      if (group.enabled === false) o.enabled = false;
    } catch (e) {}
    var n = 0;
    try { n = group.numProperties; } catch (e) {}
    for (var i = 1; i <= n; i++) {
      var p;
      try { p = group.property(i); } catch (e) { continue; }
      if (!p) continue;
      var pt = safe(function () { return p.propertyType; });
      if (pt === PropertyType.PROPERTY) {
        o.props.push(serializeProperty(p));
      } else if (maxDepth > 0) {
        o.props.push(serializeGroup(p, maxDepth - 1));
      } else {
        o.props.push({ name: p.name, matchName: p.matchName, _group: true, truncated: true });
      }
    }
    return o;
  }

  // ---------- layer parts -----------------------------------------------
  function layerType(layer) {
    if (layer instanceof TextLayer) return "text";
    if (layer instanceof ShapeLayer) return "shape";
    if (layer instanceof CameraLayer) return "camera";
    if (layer instanceof LightLayer) return "light";
    if (layer instanceof AVLayer) {
      if (safe(function () { return layer.nullLayer; })) return "null";
      if (safe(function () { return layer.adjustmentLayer; })) return "adjustment";
      if (layer.source instanceof CompItem) return "precomp";
      if (layer.source && layer.source.mainSource instanceof SolidSource) return "solid";
      return "av";
    }
    return "unknown";
  }

  function serializeTransform(layer) {
    var tg = safe(function () { return layer.property("ADBE Transform Group"); });
    if (!tg) return null;
    var map = {
      "ADBE Anchor Point": "anchorPoint",
      "ADBE Position": "position",
      "ADBE Position_0": "positionX",
      "ADBE Position_1": "positionY",
      "ADBE Position_2": "positionZ",
      "ADBE Scale": "scale",
      "ADBE Rotate Z": "rotation",
      "ADBE Rotate X": "rotationX",
      "ADBE Rotate Y": "rotationY",
      "ADBE Orientation": "orientation",
      "ADBE Opacity": "opacity"
    };
    var t = {};
    for (var mn in map) {
      var p = safe(function () { return tg.property(mn); });
      if (p) t[map[mn]] = serializeProperty(p);
    }
    return t;
  }

  function serializeSource(layer) {
    var s = layer.source;
    if (!s) return null;
    if (s instanceof CompItem) {
      return { type: "precomp", compId: s.id, compName: s.name };
    }
    if (s instanceof FootageItem) {
      var ms = safe(function () { return s.mainSource; });
      if (ms instanceof SolidSource) {
        return { type: "solid", color: cloneArray(ms.color), width: s.width, height: s.height };
      }
      if (ms instanceof FileSource) {
        return {
          type: "file",
          path: safe(function () { return ms.file.fsName; }),
          width: s.width,
          height: s.height
        };
      }
      return { type: "footage", name: s.name, width: s.width, height: s.height };
    }
    return { type: "other", name: s.name };
  }

  function serializeMasks(layer) {
    var mg = safe(function () { return layer.property("ADBE Mask Parade"); });
    if (!mg) return [];
    var out = [];
    var n = safe(function () { return mg.numProperties; }) || 0;
    for (var i = 1; i <= n; i++) {
      var mk = safe(function () { return mg.property(i); });
      if (!mk) continue;
      out.push({
        name: mk.name,
        mode: safe(function () { return enumName(MaskMode, mk.maskMode); }),
        inverted: safe(function () { return mk.inverted; }),
        shape: serializeProperty(safe(function () { return mk.property("ADBE Mask Shape"); })),
        feather: serializeProperty(safe(function () { return mk.property("ADBE Mask Feather"); })),
        opacity: serializeProperty(safe(function () { return mk.property("ADBE Mask Opacity"); })),
        expansion: serializeProperty(safe(function () { return mk.property("ADBE Mask Offset"); }))
      });
    }
    return out;
  }

  function serializeEffects(layer) {
    var fx = safe(function () { return layer.property("ADBE Effect Parade"); });
    if (!fx) return [];
    var out = [];
    var n = safe(function () { return fx.numProperties; }) || 0;
    for (var i = 1; i <= n; i++) {
      var e = safe(function () { return fx.property(i); });
      if (!e) continue;
      out.push(serializeGroup(e, 6));
    }
    return out;
  }

  function serializeLayer(layer, queue) {
    var o = {
      index: layer.index,
      name: layer.name,
      type: layerType(layer),
      enabled: safe(function () { return layer.enabled; }),
      shy: safe(function () { return layer.shy; }),
      solo: safe(function () { return layer.solo; }),
      threeD: safe(function () { return layer.threeDLayer === true; }),
      startTime: safe(function () { return layer.startTime; }),
      inPoint: safe(function () { return layer.inPoint; }),
      outPoint: safe(function () { return layer.outPoint; }),
      stretch: safe(function () { return layer.stretch; }),
      blendMode: safe(function () { return enumName(BlendingMode, layer.blendingMode); }),
      parentIndex: safe(function () { return layer.parent ? layer.parent.index : null; })
    };

    var tm = safe(function () { return layer.trackMatteType; });
    if (tm && tm !== TrackMatteType.NO_TRACK_MATTE) {
      o.trackMatte = { type: enumName(TrackMatteType, tm), matteLayerIndex: layer.index - 1 };
    }

    o.transform = serializeTransform(layer);
    o.masks = serializeMasks(layer);
    o.effects = serializeEffects(layer);

    var src = serializeSource(layer);
    if (src) {
      o.source = src;
      if (src.type === "precomp" && layer.source instanceof CompItem) queue.push(layer.source);
    }

    if (o.type === "text") {
      var td = safe(function () {
        return layer.property("ADBE Text Properties").property("ADBE Text Document");
      });
      if (td) o.text = serializeProperty(td);
      var anim = safe(function () {
        return layer.property("ADBE Text Properties").property("ADBE Text Animators");
      });
      if (anim && safe(function () { return anim.numProperties; })) {
        o.textAnimators = serializeGroup(anim, 8);
      }
    }

    if (o.type === "shape") {
      var root = safe(function () { return layer.property("ADBE Root Vectors Group"); });
      if (root) o.shape = serializeGroup(root, 14);
    }

    return o;
  }

  function serializeComp(comp, queue) {
    var m = {
      name: comp.name,
      id: comp.id,
      width: comp.width,
      height: comp.height,
      pixelAspect: comp.pixelAspect,
      frameRate: comp.frameRate,
      duration: comp.duration,
      bgColor: cloneArray(comp.bgColor),
      workAreaStart: comp.workAreaStart,
      workAreaDuration: comp.workAreaDuration,
      layers: []
    };
    for (var i = 1; i <= comp.numLayers; i++) {
      var L = comp.layer(i);
      try {
        m.layers.push(serializeLayer(L, queue));
      } catch (e) {
        m.layers.push({ index: i, name: safe(function () { return L.name; }), error: String(e) });
      }
    }
    return m;
  }

  // ---------- JSON (ExtendScript has no JSON object) -------------------
  function jsonStringify(root, pretty) {
    var sb = [];
    function esc(s) {
      return (
        '"' +
        String(s).replace(/[\\"\u0000-\u001f]/g, function (ch) {
          switch (ch) {
            case '"': return '\\"';
            case "\\": return "\\\\";
            case "\n": return "\\n";
            case "\r": return "\\r";
            case "\t": return "\\t";
            case "\b": return "\\b";
            case "\f": return "\\f";
          }
          return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4);
        }) +
        '"'
      );
    }
    function walk(v, ind) {
      var ni = pretty ? ind + "  " : "";
      var nl = pretty ? "\n" : "";
      var sp = pretty ? " " : "";
      if (v === null || v === undefined) { sb.push("null"); return; }
      var t = typeof v;
      if (t === "number") { sb.push(isFinite(v) ? String(v) : "null"); return; }
      if (t === "boolean") { sb.push(v ? "true" : "false"); return; }
      if (t === "string") { sb.push(esc(v)); return; }
      if (v instanceof Array) {
        if (!v.length) { sb.push("[]"); return; }
        sb.push("[" + nl);
        for (var i = 0; i < v.length; i++) {
          sb.push(ni); walk(v[i], ni);
          if (i < v.length - 1) sb.push(",");
          sb.push(nl);
        }
        sb.push(ind + "]");
        return;
      }
      var keys = [];
      for (var k in v) if (v.hasOwnProperty(k)) keys.push(k);
      if (!keys.length) { sb.push("{}"); return; }
      sb.push("{" + nl);
      for (var j = 0; j < keys.length; j++) {
        sb.push(ni + esc(keys[j]) + ":" + sp);
        walk(v[keys[j]], ni);
        if (j < keys.length - 1) sb.push(",");
        sb.push(nl);
      }
      sb.push(ind + "}");
    }
    walk(root, "");
    return sb.join("");
  }

  // ---------- main -----------------------------------------------------
  if (!app.project) {
    alert("No project open.");
    return;
  }
  var root = app.project.activeItem;
  if (!(root instanceof CompItem)) {
    var sel = app.project.selection;
    for (var i = 0; i < sel.length; i++) {
      if (sel[i] instanceof CompItem) { root = sel[i]; break; }
    }
  }
  if (!(root instanceof CompItem)) {
    alert("Open a composition (or select one in the Project panel), then run again.");
    return;
  }

  var comps = {};
  var queue = [root];
  var seen = {};
  while (queue.length) {
    var c = queue.shift();
    if (!c || seen[c.id]) continue;
    seen[c.id] = true;
    comps["" + c.id] = serializeComp(c, queue);
  }

  var out = {
    exporter: "aep2json 1.0",
    generatedFrom: app.project.file ? app.project.file.fsName : null,
    ae: app.version,
    rootCompId: root.id,
    comps: comps
  };

  var json = jsonStringify(out, true);

  var base = (app.project.file ? app.project.file.name.replace(/\.aep$/i, "") : root.name);
  var startDir = app.project.file ? app.project.file.parent : Folder.desktop;
  var f = new File(startDir.fsName + "/" + base + ".aep2json.json");
  f = f.saveDlg("Save comp JSON", "JSON:*.json");
  if (!f) return;
  f.encoding = "UTF-8";
  f.open("w");
  f.write(json);
  f.close();

  var nComps = 0, nLayers = 0;
  for (var id in comps) { nComps++; nLayers += comps[id].layers.length; }
  alert("aep2json: exported " + nLayers + " layers across " + nComps + " comp(s) to:\n" + f.fsName);
})();
