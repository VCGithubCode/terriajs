import i18next from "i18next";
import { runInAction, computed } from "mobx";
import { createTransformer } from "mobx-utils";
import filterOutUndefined from "../Core/filterOutUndefined";
import URI from "urijs";
import {
  isJsonObject,
  isJsonString,
  JsonArray,
  JsonObject
} from "../Core/Json";
import loadJson from "../Core/loadJson";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import TerriaError from "../Core/TerriaError";
import ReferenceMixin from "../ModelMixins/ReferenceMixin";
import UrlMixin from "../ModelMixins/UrlMixin";
import ArcGisPortalItemTraits from "../Traits/ArcGisPortalItemTraits";
import ArcGisPortalItemFormatTraits from "../Traits/ArcGisPortalItemFormatTraits";
import CatalogMemberFactory from "./CatalogMemberFactory";
import CommonStrata from "./CommonStrata";
import CreateModel from "./CreateModel";
import createStratumInstance from "./createStratumInstance";
import { BaseModel } from "./Model";
import ModelPropertiesFromTraits from "./ModelPropertiesFromTraits";
import proxyCatalogItemUrl from "./proxyCatalogItemUrl";
import StratumFromTraits from "./StratumFromTraits";
import LoadableStratum from "./LoadableStratum";
import Terria from "./Terria";
import updateModelFromJson from "./updateModelFromJson";
import ModelTraits from "../Traits/ModelTraits";
import { RectangleTraits } from "../Traits/MappableTraits";
import { InfoSectionTraits } from "../Traits/CatalogMemberTraits";
import StratumOrder from "./StratumOrder";
import GroupMixin from "../ModelMixins/GroupMixin";
import DOMPurify from "dompurify";

import { ArcGisItem } from "./ArcGisPortalDefinitions";
import ArcGisPortalCatalogGroup from "./ArcGisPortalCatalogGroup";

export class ArcGisPortalItemStratum extends LoadableStratum(
  ArcGisPortalItemTraits
) {
  static stratumName = "arcGisPortalDataset";

  constructor(
    private readonly arcgisPortalItemReference: ArcGisPortalItemReference,
    private readonly arcgisPortalCatalogGroup:
      | ArcGisPortalCatalogGroup
      | undefined
  ) {
    super();
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new ArcGisPortalItemStratum(
      this.arcgisPortalItemReference,
      this.arcgisPortalCatalogGroup
    ) as this;
  }

  static async load(
    arcgisPortalItemReference: ArcGisPortalItemReference,
    arcgisPortalCatalogGroup: ArcGisPortalCatalogGroup | undefined
  ) {
    if (arcgisPortalItemReference._arcgisItem === undefined) {
      if (arcgisPortalItemReference.uniqueId !== undefined) {
        arcgisPortalItemReference._portalRootUrl =
          arcgisPortalItemReference.url;
        arcgisPortalItemReference._arcgisItem = await loadPortalItem(
          arcgisPortalItemReference
        );
        arcgisPortalItemReference.setSupportedFormatFromItem(
          arcgisPortalItemReference._arcgisItem
        );
      }
    } else if (arcgisPortalCatalogGroup !== undefined) {
      arcgisPortalItemReference._portalRootUrl = arcgisPortalCatalogGroup.url;
    }
    return new ArcGisPortalItemStratum(
      arcgisPortalItemReference,
      arcgisPortalCatalogGroup
    );
  }

  @computed get arcgisPortalItem(): ArcGisItem | undefined {
    if (this.arcgisPortalItemReference._arcgisItem === undefined)
      return undefined;
    return this.arcgisPortalItemReference._arcgisItem;
  }

  @computed get portalItemUrl(): string | undefined {
    if (
      this.arcgisPortalItem === undefined ||
      this.arcgisPortalItemReference._portalRootUrl === undefined
    )
      return undefined;
    const uri = new URI(this.arcgisPortalItemReference._portalRootUrl)
      .segment(`/home/item.html`)
      .addQuery("id", this.arcgisPortalItem.id);
    return uri.toString();
  }

  @computed get url() {
    if (this.arcgisPortalItem === undefined) return undefined;
    if (this.arcgisPortalItem.type === "Scene Service")
      return `/i3s-to-3dtiles/${this.arcgisPortalItem.url}`;
    return this.arcgisPortalItem.url;
  }

  @computed get name() {
    if (this.arcgisPortalItem === undefined) return undefined;
    return this.arcgisPortalItem.title;
  }

  @computed get description() {
    if (this.arcgisPortalItem === undefined) return undefined;
    // return this.arcgisPortalItem.description
    return DOMPurify.sanitize(this.arcgisPortalItem.description, {
      FORBID_ATTR: ["style"],
      FORBID_TAGS: ["font"]
    });
  }

  @computed get rectangle() {
    if (this.arcgisPortalItem === undefined) return undefined;

    if (this.arcgisPortalItem.extent !== null) {
      return createStratumInstance(RectangleTraits, {
        west: this.arcgisPortalItem.extent[0][0],
        south: this.arcgisPortalItem.extent[0][1],
        east: this.arcgisPortalItem.extent[1][0],
        north: this.arcgisPortalItem.extent[1][1]
      });
    }
    return undefined;
  }

  @computed get info() {
    const outArray: StratumFromTraits<InfoSectionTraits>[] = [];
    if (this.arcgisPortalItem === undefined) return outArray;
    if (this.arcgisPortalItem.licenseInfo !== undefined) {
      outArray.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("models.arcgisPortal.licence"),
          content: DOMPurify.sanitize(this.arcgisPortalItem.licenseInfo, {
            FORBID_ATTR: ["style"],
            FORBID_TAGS: ["font"]
          })
        })
      );
    }

    // TODO: Check that this doesn't need to be sanitized
    outArray.push(
      createStratumInstance(InfoSectionTraits, {
        name: i18next.t("models.arcgisPortal.openInPortal"),
        content: `<a href="${this.portalItemUrl}"><button>${i18next.t(
          "models.arcgisPortal.openInPortal"
        )}</button></a>`
      })
    );

    return outArray;
  }
}

StratumOrder.addLoadStratum(ArcGisPortalItemStratum.stratumName);

export default class ArcGisPortalItemReference extends UrlMixin(
  ReferenceMixin(CreateModel(ArcGisPortalItemTraits))
) {
  static readonly defaultSupportedFormats: StratumFromTraits<
    ArcGisPortalItemFormatTraits
  >[] = [
    createStratumInstance(ArcGisPortalItemFormatTraits, {
      id: "I3S",
      formatRegex: "Scene Service",
      urlRegex: "SceneServer$|SceneServer/$",
      definition: {
        type: "3d-tiles"
      }
    }),
    // createStratumInstance(ArcGisPortalItemFormatTraits, {
    //   id: "WFS",
    //   formatRegex: "WFS",
    //   urlRegex: "WFSServer",
    //   definition: {
    //     type: "wfs"
    //   }
    // }),
    createStratumInstance(ArcGisPortalItemFormatTraits, {
      id: "WMS",
      formatRegex: "WMS",
      urlRegex: "WMSServer",
      definition: {
        type: "wms"
      }
    }),
    createStratumInstance(ArcGisPortalItemFormatTraits, {
      id: "ArcGIS MapServer Group",
      formatRegex: "Map Service",
      urlRegex: "MapServer$|MapServer/$",
      definition: {
        type: "esri-mapServer-group"
      }
    }),
    createStratumInstance(ArcGisPortalItemFormatTraits, {
      id: "ArcGIS MapServer",
      formatRegex: "Map Service",
      urlRegex: /MapServer\/\d/,
      definition: {
        type: "esri-mapServer"
      }
    }),
    createStratumInstance(ArcGisPortalItemFormatTraits, {
      id: "ArcGIS FeatureServer Group",
      formatRegex: "Feature Service",
      urlRegex: "FeatureServer$|FeatureServer/$",
      definition: {
        type: "esri-featureServer-group"
      }
    }),
    createStratumInstance(ArcGisPortalItemFormatTraits, {
      id: "ArcGIS FeatureServer",
      formatRegex: "Feature Service",
      urlRegex: /FeatureServer\/\d/,
      definition: {
        type: "esri-featureServer"
      }
    }),
    createStratumInstance(ArcGisPortalItemFormatTraits, {
      id: "Kml",
      formatRegex: "KML",
      definition: {
        type: "kml"
      }
    })
  ];

  static readonly type = "arcgis-portal-item";

  get type() {
    return ArcGisPortalItemReference.type;
  }

  get typeName() {
    return i18next.t("models.arcgisPortal.name");
  }

  _arcgisItem: ArcGisItem | undefined = undefined;
  _arcgisPortalCatalogGroup: ArcGisPortalCatalogGroup | undefined = undefined;
  _supportedFormat: PreparedSupportedFormat | undefined = undefined;
  _portalRootUrl: string | undefined = undefined;

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel,
    strata?: Map<string, StratumFromTraits<ModelTraits>>
  ) {
    super(id, terria, sourceReference, strata);
    this.setTrait(
      CommonStrata.defaults,
      "supportedFormats",
      ArcGisPortalItemReference.defaultSupportedFormats
    );
  }

  @computed
  get preparedSupportedFormats(): PreparedSupportedFormat[] {
    return (
      this.supportedFormats && this.supportedFormats.map(prepareSupportedFormat)
    );
  }

  isItemInSupportedFormats(
    item: ArcGisItem | undefined
  ): PreparedSupportedFormat | undefined {
    if (item === undefined) return undefined;
    for (let i = 0; i < this.preparedSupportedFormats.length; ++i) {
      const format = this.preparedSupportedFormats[i];
      // This is a bit clunky but format handling for non-Esri stuff in portal is a bit unpredictable
      if (format.formatRegex === undefined || format.urlRegex === undefined) {
        // eg KML we can match using format regex but not the URL
        if (format.formatRegex) {
          if (format.formatRegex.test(item.type)) return format;
        } else if (format.urlRegex) {
          if (format.urlRegex.test(item.url)) return format;
        }
      } else {
        if (
          format.formatRegex.test(item.type) &&
          format.urlRegex.test(item.url)
        ) {
          return format;
        }
      }
    }
    return undefined;
  }

  setDataset(item: ArcGisItem) {
    this._arcgisItem = item;
  }

  setArcgisPortalCatalog(arcgisCatalogGroup: ArcGisPortalCatalogGroup) {
    this._arcgisPortalCatalogGroup = arcgisCatalogGroup;
  }

  setSupportedFormatFromItem(item: ArcGisItem | undefined) {
    this._supportedFormat = this.isItemInSupportedFormats(item);
  }

  async setArcgisStrata(model: BaseModel) {
    const stratum = await ArcGisPortalItemStratum.load(
      this,
      this._arcgisPortalCatalogGroup
    );
    if (stratum === undefined) return;
    runInAction(() => {
      model.strata.set(ArcGisPortalItemStratum.stratumName, stratum);
    });
  }

  setItemProperties(model: BaseModel, itemProperties: any) {
    runInAction(() => {
      model.setTrait(CommonStrata.override, "itemProperties", itemProperties);
    });
  }

  async forceLoadReference(
    previousTarget: BaseModel | undefined
  ): Promise<BaseModel | undefined> {
    // So when we first crawl we'll get this far
    await this.setArcgisStrata(this);
    // this.setSupportedFormatFromItem(this._arcgisItem);
    if (this._supportedFormat === undefined) return undefined;

    // See comments below re this sequence
    const itemDataInfo:
      | ArcGisItemInfo
      | undefined = await loadAdditionalPortalInfo(this);
    if (itemDataInfo !== undefined && this._arcgisItem !== undefined) {
      if (!itemDataInfo.error && itemDataInfo.layers) {
        if (itemDataInfo.layers.length > 0) {
          this._arcgisItem.url = `${this._arcgisItem.url}/${itemDataInfo.layers[0].id}`;
        }
      }
      this.setSupportedFormatFromItem(this._arcgisItem);
    }

    // One final catch to handing types
    // Tiled MapServices dont use a single layer
    if (
      this._arcgisItem !== undefined &&
      this._arcgisItem.type === "Map Service" &&
      this._arcgisItem.typeKeywords.indexOf("Tiled") > -1
    ) {
      const mapServerFormat = this.preparedSupportedFormats.filter(
        f => f.definition.type === "esri-mapServer"
      );
      if (mapServerFormat.length === 1)
        this._supportedFormat = mapServerFormat[0];
    }

    const model = CatalogMemberFactory.create(
      this._supportedFormat.definition.type as string,
      this.uniqueId,
      this.terria,
      this
    );

    if (model === undefined) return;
    previousTarget = model;
    await this.setArcgisStrata(model);

    const defintionStratum = this.strata.get("definition");
    if (defintionStratum) {
      model.strata.set("definition", defintionStratum);
      model.setTrait("definition", "url", undefined);
    }

    if (this.itemProperties !== undefined) {
      const ipKeys: string[] = Object.keys(this.itemProperties);
      ipKeys.forEach((p: string) => {
        // @ts-ignore
        model.setTrait(CommonStrata.override, p, this.itemProperties[p]);
      });
    }

    return model;
  }
}

interface ArcGisItemLayerInfo {
  id: string;
}

interface ArcGisItemInfo {
  layers?: ArcGisItemLayerInfo[];
  error?: JsonObject;
}

interface ArcGisItemWithFormat {
  supportedFormat: PreparedSupportedFormat;
  arcgisItem: ArcGisItem;
}

interface PreparedSupportedFormat {
  formatRegex: RegExp | undefined;
  urlRegex: RegExp | undefined;
  definition: JsonObject;
}

async function loadPortalItem(portalItem: ArcGisPortalItemReference) {
  var uri = new URI(portalItem._portalRootUrl)
    .segment(`/sharing/rest/content/items/${portalItem.itemId}`)
    .addQuery({ f: "json" });

  const response: ArcGisItem = await loadJson(
    proxyCatalogItemUrl(portalItem, uri.toString(), "1d")
  );
  return response;
}

// Portal has this weird habit of storing useful additional info about an item
// such as which layers to use from a group of layers at the /data endpoint
// But this only relevant on some layers
async function loadAdditionalPortalInfo(portalItem: ArcGisPortalItemReference) {
  if (portalItem._arcgisItem === undefined) return undefined;
  const baseUrl = portalItem._portalRootUrl;
  var uri = new URI(baseUrl)
    .segment(`/sharing/rest/content/items/${portalItem._arcgisItem.id}/data`)
    .addQuery({ f: "json" });

  // The request also returns 200 even if the page is blank causing json errors
  // Sometimes it actually returns json containing an error, but not always
  try {
    const response: ArcGisItemInfo = await loadJson(
      proxyCatalogItemUrl(portalItem, uri.toString(), "1d")
    );
    return response;
  } catch (err) {
    return undefined;
  }
}

const prepareSupportedFormat = createTransformer(
  (format: ModelPropertiesFromTraits<ArcGisPortalItemFormatTraits>) => {
    return {
      urlRegex: format.urlRegex
        ? new RegExp(format.urlRegex as any, "i")
        : undefined,
      formatRegex: format.formatRegex
        ? new RegExp(format.formatRegex, "i")
        : undefined,
      definition: format.definition || {}
    };
  }
);
