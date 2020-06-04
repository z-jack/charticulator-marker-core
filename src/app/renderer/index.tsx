// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as React from "react";

import {
  Graphics,
  Color,
  shallowClone,
  getColorConverter,
  uniqueID,
  markID
} from "../../core";
import { toSVGNumber } from "../utils";
import {
  ChartComponent,
  GlyphEventHandler
} from "../../container/chart_component";
import {
  ColorFilter,
  NumberModifier,
  PathMaker,
  makePath
} from "../../core/graphics";

// adapted from https://stackoverflow.com/a/20820649
function desaturate(color: Color, amount: number) {
  const { r, g, b } = color;
  const l = 0.3 * r + 0.6 * g + 0.1 * b;
  return {
    r: Math.min(r + amount * (l - r), 255),
    g: Math.min(g + amount * (l - g), 255),
    b: Math.min(b + amount * (l - b), 255)
  };
}

const srgb2lab = getColorConverter("sRGB", "lab");
const lab2srgb = getColorConverter("lab", "sRGB");

function modifyNumber(value: number, modifier: NumberModifier) {
  if (modifier.set != null) {
    return modifier.set;
  } else {
    if (modifier.multiply != null) {
      value *= modifier.multiply;
    }
    if (modifier.add != null) {
      value += modifier.add;
    }
    if (modifier.pow != null) {
      value = Math.pow(value, modifier.pow);
    }
    return value;
  }
}

export function applyColorFilter(color: Color, colorFilter: ColorFilter) {
  let [L, A, B] = srgb2lab(color.r, color.g, color.b);
  if (colorFilter.saturation) {
    const s = Math.sqrt(A * A + B * B);
    const sPrime = modifyNumber(s, colorFilter.saturation);
    if (s == 0) {
      A = 0;
      B = 0;
    } else {
      A *= sPrime / s;
      B *= sPrime / s;
    }
  }
  if (colorFilter.lightness) {
    L = modifyNumber(L / 100, colorFilter.lightness) * 100;
  }
  const [r, g, b] = lab2srgb(L, A, B);
  return { r, g, b };
}

export function renderColor(color: Color, colorFilter?: ColorFilter): string {
  if (!color) {
    return `rgb(0,0,0)`;
  }
  if (colorFilter) {
    color = applyColorFilter(color, colorFilter);
  }
  return `rgb(${color.r.toFixed(0)},${color.g.toFixed(0)},${color.b.toFixed(
    0
  )})`;
}

export function renderStyle(style: Graphics.Style): React.CSSProperties {
  if (style == null) {
    return {};
  }
  return {
    stroke: style.strokeColor
      ? renderColor(style.strokeColor, style.colorFilter)
      : "none",
    strokeOpacity: style.strokeOpacity != undefined ? style.strokeOpacity : 1,
    strokeWidth: style.strokeWidth != undefined ? style.strokeWidth : 1,
    strokeLinecap:
      style.strokeLinecap != undefined ? style.strokeLinecap : "round",
    strokeLinejoin:
      style.strokeLinejoin != undefined ? style.strokeLinejoin : "round",
    fill: style.fillColor
      ? renderColor(style.fillColor, style.colorFilter)
      : "none",
    fillOpacity: style.fillOpacity != undefined ? style.fillOpacity : 1,
    textAnchor: style.textAnchor != undefined ? style.textAnchor : "start",
    opacity: style.opacity != undefined ? style.opacity : 1
  };
}

const path_commands: { [name: string]: (args: number[]) => string } = {
  M: (args: number[]) => `M ${toSVGNumber(args[0])},${toSVGNumber(-args[1])}`,
  L: (args: number[]) => `L ${toSVGNumber(args[0])},${toSVGNumber(-args[1])}`,
  C: (args: number[]) =>
    `C ${toSVGNumber(args[0])},${toSVGNumber(-args[1])},${toSVGNumber(
      args[2]
    )},${toSVGNumber(-args[3])},${toSVGNumber(args[4])},${toSVGNumber(
      -args[5]
    )}`,
  Q: (args: number[]) =>
    `Q ${toSVGNumber(args[0])},${toSVGNumber(-args[1])},${toSVGNumber(
      args[2]
    )},${toSVGNumber(-args[3])}`,
  A: (args: number[]) =>
    `A ${toSVGNumber(args[0])},${toSVGNumber(args[1])},${toSVGNumber(
      args[2]
    )},${toSVGNumber(args[3])},${toSVGNumber(args[4])},${toSVGNumber(
      args[5]
    )},${toSVGNumber(-args[6])}`,
  Z: () => `Z`
};

export function renderSVGPath(cmds: Array<{ cmd: string; args: number[] }>) {
  return cmds.map(x => path_commands[x.cmd](x.args)).join(" ");
}

export function renderTransform(transform: Graphics.RigidTransform): string {
  if (!transform) {
    return null;
  }
  if (Math.abs(transform.angle) < 1e-7) {
    return `translate(${toSVGNumber(transform.x)},${toSVGNumber(
      -transform.y
    )})`;
  } else {
    return `translate(${toSVGNumber(transform.x)},${toSVGNumber(
      -transform.y
    )}) rotate(${toSVGNumber(-transform.angle)})`;
  }
}

export interface DataSelection {
  isSelected(table: string, rowIndices: number[]): boolean;
}

export type GraphicalElementEventHandler = (
  element: Graphics.Element["selectable"],
  event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
) => any;

export interface RenderGraphicalElementSVGOptions {
  noStyle?: boolean;
  styleOverride?: Graphics.Style;
  className?: string;
  key?: string;
  chartComponentSync?: boolean;
  externalResourceResolver?: (url: string) => string;
  /** Called when a glyph is clicked */
  onClick?: GraphicalElementEventHandler;
  /** Called when the mouse enters a glyph */
  onMouseEnter?: GraphicalElementEventHandler;
  /** Called when the mouse leaves a glyph */
  onMouseLeave?: GraphicalElementEventHandler;

  selection?: DataSelection;
}

class TextOnPath extends React.PureComponent<{
  text: string;
  style: React.CSSProperties;
  align: "start" | "middle" | "end";
  cmds: any;
}> {
  private pathID: string = uniqueID();

  public render() {
    return (
      <g>
        <defs>
          <path
            id={this.pathID}
            fill="none"
            stroke="red"
            d={renderSVGPath(this.props.cmds)}
          />
        </defs>
        <text style={{ ...this.props.style, textAnchor: this.props.align }}>
          <textPath
            href={`#${this.pathID}`}
            startOffset={
              this.props.align == "start"
                ? "0%"
                : this.props.align == "middle"
                ? "50%"
                : "100%"
            }
          >
            {this.props.text}
          </textPath>
        </text>
      </g>
    );
  }
}

function getElementClassType(datum: string): string[] {
  try {
    let data = JSON.parse(datum);
    if (data instanceof Array) {
      data = data[0];
    }
    if (data._TYPE) {
      if (data._TYPE.startsWith("axis-") || data._TYPE.startsWith("legend-")) {
        return ["mark", data._TYPE];
      } else if (data._TYPE == "nested-chart" || data._TYPE == "axis" || data._TYPE == "legend") {
        return [data._TYPE];
      } else {
        return ["mark", data._MARKID, data._TYPE];
      }
    }
    return ["mark"];
  } catch {
    return [];
  }
}

export function renderGraphicalElementSVG(
  element: Graphics.Element,
  options?: RenderGraphicalElementSVGOptions
): JSX.Element {
  if (!element) {
    return null;
  }

  if (!options) {
    options = {};
  }

  const style = options.noStyle
    ? null
    : renderStyle(options.styleOverride || element.style);

  // OnClick event handler
  const mouseEvents: {
    onClick?: (e: React.MouseEvent<Element>) => void;
    onMouseEnter?: (e: React.MouseEvent<Element>) => void;
    onMouseLeave?: (e: React.MouseEvent<Element>) => void;
  } = {};
  if (element.selectable) {
    style.cursor = "pointer";
    style.pointerEvents = "all";
    if (options.onClick) {
      mouseEvents.onClick = (e: React.MouseEvent<Element>) => {
        e.stopPropagation();
        options.onClick(element.selectable, e.nativeEvent);
      };
    }
    if (options.onMouseEnter) {
      mouseEvents.onMouseEnter = (e: React.MouseEvent<Element>) => {
        options.onMouseEnter(element.selectable, e.nativeEvent);
      };
    }
    if (options.onMouseLeave) {
      mouseEvents.onMouseLeave = (e: React.MouseEvent<Element>) => {
        options.onMouseLeave(element.selectable, e.nativeEvent);
      };
    }
  }

  switch (element.type) {
    case "rect": {
      const rect = element as Graphics.Rect;
      const maker = makePath(options.styleOverride || element.style);
      maker.moveTo(rect.x1, rect.y1);
      maker.lineTo(rect.x1, rect.y2);
      maker.lineTo(rect.x2, rect.y2);
      maker.lineTo(rect.x2, rect.y1);
      maker.closePath();
      return (
        <path
          key={options.key}
          {...mouseEvents}
          id={markID(element["data-datum"])}
          className={[
            ...([options.className] || []),
            ...(element["data-datum"]
              ? getElementClassType(element["data-datum"])
              : [])
          ].join(" ")}
          style={style}
          d={renderSVGPath(maker.path.cmds)}
          data-datum={element["data-datum"] || null}
        />
      );
    }
    case "circle": {
      const circle = element as Graphics.Circle;
      const maker = makePath(options.styleOverride || element.style);
      maker.moveTo(circle.cx - circle.r, circle.cy);
      maker.arcTo(circle.r, circle.r, 0, 1, 0, circle.cx + circle.r, circle.cy);
      maker.arcTo(circle.r, circle.r, 0, 1, 0, circle.cx - circle.r, circle.cy);
      maker.closePath();
      return (
        <path
          key={options.key}
          {...mouseEvents}
          id={markID(element["data-datum"])}
          className={[
            ...([options.className] || []),
            ...(element["data-datum"]
              ? getElementClassType(element["data-datum"])
              : [])
          ].join(" ")}
          style={style}
          d={renderSVGPath(maker.path.cmds)}
          data-datum={element["data-datum"] || null}
        />
      );
    }
    case "ellipse": {
      const ellipse = element as Graphics.Ellipse;
      const maker = makePath(options.styleOverride || element.style);
      maker.moveTo(ellipse.x1, (ellipse.y1 + ellipse.y2) / 2);
      maker.arcTo(
        Math.abs(ellipse.x1 - ellipse.x2) / 2,
        Math.abs(ellipse.y1 - ellipse.y2) / 2,
        0,
        1,
        0,
        ellipse.x2,
        (ellipse.y1 + ellipse.y2) / 2
      );
      maker.arcTo(
        Math.abs(ellipse.x1 - ellipse.x2) / 2,
        Math.abs(ellipse.y1 - ellipse.y2) / 2,
        0,
        1,
        0,
        ellipse.x1,
        (ellipse.y1 + ellipse.y2) / 2
      );
      maker.closePath();
      return (
        <path
          key={options.key}
          {...mouseEvents}
          id={markID(element["data-datum"])}
          className={[
            ...([options.className] || []),
            ...(element["data-datum"]
              ? getElementClassType(element["data-datum"])
              : [])
          ].join(" ")}
          style={style}
          d={renderSVGPath(maker.path.cmds)}
          data-datum={element["data-datum"] || null}
        />
      );
    }
    case "line": {
      const line = element as Graphics.Line;
      const maker = makePath(options.styleOverride || element.style);
      maker.moveTo(line.x1, line.y1);
      maker.lineTo(line.x2, line.y2);
      return (
        <path
          key={options.key}
          {...mouseEvents}
          id={markID(element["data-datum"])}
          className={[
            ...([options.className] || []),
            ...(element["data-datum"]
              ? getElementClassType(element["data-datum"])
              : [])
          ].join(" ")}
          style={style}
          d={renderSVGPath(maker.path.cmds)}
          data-datum={element["data-datum"] || null}
        />
      );
    }
    case "polygon": {
      const polygon = element as Graphics.Polygon;
      const maker = makePath(options.styleOverride || element.style);
      maker.moveTo(
        (polygon.points[0] || { x: 0, y: 0 }).x,
        (polygon.points[0] || { x: 0, y: 0 }).y
      );
      polygon.points.forEach((p, i) => {
        if (i <= 0) {
          return;
        }
        maker.lineTo(p.x, p.y);
      });
      maker.closePath();
      return (
        <path
          key={options.key}
          {...mouseEvents}
          id={markID(element["data-datum"])}
          className={[
            ...([options.className] || []),
            ...(element["data-datum"]
              ? getElementClassType(element["data-datum"])
              : [])
          ].join(" ")}
          style={style}
          d={renderSVGPath(maker.path.cmds)}
          data-datum={element["data-datum"] || null}
        />
      );
    }
    case "path": {
      const path = element as Graphics.Path;
      const d = renderSVGPath(path.cmds);
      return (
        <path
          key={options.key}
          {...mouseEvents}
          id={markID(element["data-datum"])}
          className={[
            ...([options.className] || []),
            ...(element["data-datum"]
              ? getElementClassType(element["data-datum"])
              : [])
          ].join(" ")}
          style={style}
          d={d}
          data-datum={element["data-datum"] || null}
        />
      );
    }
    case "text-on-path": {
      const text = element as Graphics.TextOnPath;
      style.fontFamily = text.fontFamily;
      style.fontSize = text.fontSize + "px";
      console.log(text);
      return (
        <TextOnPath
          text={text.text}
          style={style}
          cmds={text.pathCmds}
          align={text.align}
        />
      );
    }
    case "text": {
      const text = element as Graphics.Text;
      style.fontFamily = text.fontFamily;
      style.fontSize = text.fontSize + "px";
      if (style.stroke != "none") {
        const style2 = shallowClone(style);
        style2.fill = style.stroke;
        const e1 = (
          <text
            {...mouseEvents}
            id={markID(element["data-datum"])}
            className={[
              ...([options.className] || []),
              ...(element["data-datum"]
                ? getElementClassType(element["data-datum"])
                : [])
            ].join(" ")}
            style={style2}
            x={text.cx}
            y={-text.cy}
            data-datum={element["data-datum"] || null}
          >
            {text.text}
          </text>
        );
        style.stroke = "none";
        const e2 = (
          <text
            {...mouseEvents}
            id={markID(element["data-datum"])}
            className={[
              ...([options.className] || []),
              ...(element["data-datum"]
                ? getElementClassType(element["data-datum"])
                : [])
            ].join(" ")}
            style={style}
            x={text.cx}
            y={-text.cy}
            data-datum={element["data-datum"] || null}
          >
            {text.text}
          </text>
        );
        return (
          <g key={options.key}>
            {e1}
            {e2}
          </g>
        );
      } else {
        return (
          <text
            key={options.key}
            {...mouseEvents}
            id={markID(element["data-datum"])}
            className={[
              ...([options.className] || []),
              ...(element["data-datum"]
                ? getElementClassType(element["data-datum"])
                : [])
            ].join(" ")}
            style={style}
            x={text.cx}
            y={-text.cy}
            data-datum={element["data-datum"] || null}
          >
            {text.text}
          </text>
        );
      }
    }
    case "image": {
      const image = element as Graphics.Image;
      let preserveAspectRatio = null;
      switch (image.mode) {
        case "letterbox":
          preserveAspectRatio = "meet";
          break;
        case "stretch":
          preserveAspectRatio = "none";
          break;
      }
      return (
        <image
          key={options.key}
          {...mouseEvents}
          id={markID(element["data-datum"])}
          className={[
            ...([options.className] || []),
            ...(element["data-datum"]
              ? getElementClassType(element["data-datum"])
              : [])
          ].join(" ")}
          style={style}
          preserveAspectRatio={preserveAspectRatio}
          xlinkHref={
            options.externalResourceResolver
              ? options.externalResourceResolver(image.src)
              : image.src
          }
          x={image.x}
          y={-image.y - image.height}
          width={image.width}
          height={image.height}
          data-datum={element["data-datum"] || null}
        />
      );
    }
    case "chart-container": {
      const component = element as Graphics.ChartContainerElement;
      const subSelection = options.selection
        ? {
            isSelected: (table: string, rowIndices: number[]) => {
              // Get parent row indices from component row indices
              const parentRowIndices = rowIndices.map(
                x => component.selectable.rowIndices[x]
              );
              // Query the selection with parent row indices
              return options.selection.isSelected(
                component.selectable.plotSegment.table,
                parentRowIndices
              );
            }
          }
        : null;

      const convertEventHandler = (
        handler: GraphicalElementEventHandler
      ): GlyphEventHandler => {
        if (!handler) {
          return null;
        }
        return (s, parameters) => {
          if (s == null) {
            // Clicked inside the ChartComponent but not on a glyph,
            // in this case we select the whole thing
            handler(component.selectable, parameters);
          } else {
            // Clicked on a glyph of ChartComponent (or a sub-component)
            // in this case we translate the component's rowIndices its parent's
            handler(
              {
                plotSegment: component.selectable.plotSegment,
                glyphIndex: component.selectable.glyphIndex,
                rowIndices: s.rowIndices.map(
                  i => component.selectable.rowIndices[i]
                )
              },
              parameters
            );
          }
        };
      };

      return (
        <ChartComponent
          key={options.key}
          chart={component.chart}
          dataset={component.dataset}
          width={component.width}
          height={component.height}
          rootElement="g"
          sync={options.chartComponentSync}
          selection={subSelection}
          onGlyphClick={convertEventHandler(options.onClick)}
          onGlyphMouseEnter={convertEventHandler(options.onMouseEnter)}
          onGlyphMouseLeave={convertEventHandler(options.onMouseLeave)}
          rendererOptions={{
            chartComponentSync: options.chartComponentSync,
            externalResourceResolver: options.externalResourceResolver
          }}
        />
      );
    }
    case "group": {
      const group = element as Graphics.Group;
      return (
        <g
          transform={renderTransform(group.transform)}
          key={group.key || options.key}
          style={{
            opacity:
              group.style && group.style.opacity != null
                ? group.style.opacity
                : 1
          }}
          id={markID(element["data-datum"])}
          className={getElementClassType(element["data-datum"]).join(" ")}
          data-datum={
            element["data-datum"] &&
            (element["data-datum"].startsWith("{") ||
              element["data-datum"].startsWith("["))
              ? element["data-datum"]
              : null
          }
          {...mouseEvents}
        >
          {group.elements.map((x, index) => {
            return renderGraphicalElementSVG(x, {
              key: `m${index}`,
              chartComponentSync: options.chartComponentSync,
              externalResourceResolver: options.externalResourceResolver,
              onClick: options.onClick,
              onMouseEnter: options.onMouseEnter,
              onMouseLeave: options.onMouseLeave,
              selection: options.selection
            });
          })}
        </g>
      );
    }
  }
}

export class GraphicalElementDisplay extends React.PureComponent<
  { element: Graphics.Element },
  {}
> {
  public render() {
    return renderGraphicalElementSVG(this.props.element);
  }
}
