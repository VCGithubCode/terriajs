import hoistStatics from "hoist-non-react-statics";
import { TFunction } from "i18next";
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { IDisposer } from "mobx-utils";
import React, { useState } from "react";
import { WithTranslation, withTranslation } from "react-i18next";
import styled, { DefaultTheme, useTheme, withTheme } from "styled-components";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import createGuid from "terriajs-cesium/Source/Core/createGuid";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import ImageryProvider from "terriajs-cesium/Source/Scene/ImageryProvider";
import ImagerySplitDirection from "terriajs-cesium/Source/Scene/ImagerySplitDirection";
import filterOutUndefined from "../../../Core/filterOutUndefined";
import LatLonHeight from "../../../Core/LatLonHeight";
import PickedFeatures from "../../../Map/PickedFeatures";
import prettifyCoordinates from "../../../Map/prettifyCoordinates";
import DiffableMixin from "../../../ModelMixins/DiffableMixin";
import CommonStrata from "../../../Models/CommonStrata";
import Feature from "../../../Models/Feature";
import hasTraits, { HasTrait } from "../../../Models/hasTraits";
import {
  getMarkerLocation,
  isMarkerVisible,
  removeMarker
} from "../../../Models/LocationMarkerUtils";
import Mappable, { ImageryParts } from "../../../Models/Mappable";
import { AvailableStyle } from "../../../Models/SelectableStyle";
import SplitItemReference from "../../../Models/SplitItemReference";
import Terria from "../../../Models/Terria";
import ViewState from "../../../ReactViewModels/ViewState";
import Select from "../../../Styled/Select";
import RasterLayerTraits from "../../../Traits/RasterLayerTraits";
import { GLYPHS, StyledIcon } from "../../Icon";
import DatePicker from "./DatePicker";
import Styles from "./diff-tool.scss";
import LocationPicker from "./LocationPicker";

const Box: any = require("../../../Styled/Box").default;
const Button: any = require("../../../Styled/Button").default;
const RawButton: any = require("../../../Styled/Button").RawButton;
const Text: any = require("../../../Styled/Text").default;
const Spacing: any = require("../../../Styled/Spacing").default;
const dateFormat = require("dateformat");
const Loader = require("../../Loader");

type DiffableItem = DiffableMixin.Instance;

interface PropsType extends WithTranslation {
  viewState: ViewState;
  sourceItem: DiffableItem;
  theme: DefaultTheme;
}

@observer
class DiffTool extends React.Component<PropsType> {
  static readonly toolName = "Image Difference";

  @observable private leftItem?: DiffableItem;
  @observable private rightItem?: DiffableItem;
  @observable private userSelectedSourceItem?: DiffableItem;

  private splitterItemsDisposer?: IDisposer;
  private originalSettings: any;

  @computed
  get sourceItem(): DiffableItem {
    return this.userSelectedSourceItem || this.props.sourceItem;
  }

  @action.bound
  changeSourceItem(sourceItem: DiffableItem) {
    this.userSelectedSourceItem = sourceItem;
  }

  @action
  async createSplitterItems() {
    try {
      const [leftItem, rightItem] = await Promise.all([
        createSplitItem(this.sourceItem, ImagerySplitDirection.LEFT),
        createSplitItem(this.sourceItem, ImagerySplitDirection.RIGHT)
      ]);
      runInAction(() => {
        this.leftItem = leftItem;
        this.rightItem = rightItem;
      });
    } catch {}
  }

  @action
  removeSplitterItems() {
    this.leftItem && removeSplitItem(this.leftItem);
    this.rightItem && removeSplitItem(this.rightItem);
  }

  @action
  enterDiffTool() {
    // Start the reaction that splits the sourceItem into left & right items
    this.splitterItemsDisposer = reaction(
      () => this.sourceItem,
      () => {
        this.removeSplitterItems();
        this.createSplitterItems();
      },
      { fireImmediately: true }
    );

    const viewState = this.props.viewState;
    const terria = viewState.terria;
    this.originalSettings = {
      showSplitter: terria.showSplitter,
      isMapFullScreen: viewState.isMapFullScreen
    };
    terria.showSplitter = true;
    viewState.setIsMapFullScreen(true);
    this.sourceItem.setTrait(CommonStrata.user, "show", false);
  }

  @action
  leaveDiffTool() {
    const viewState = this.props.viewState;
    const terria = viewState.terria;
    const originalSettings = this.originalSettings;
    this.removeSplitterItems();
    this.splitterItemsDisposer?.();
    terria.showSplitter = originalSettings.showSplitter;
    viewState.setIsMapFullScreen(originalSettings.isMapFullScreen);
    this.sourceItem.setTrait(CommonStrata.user, "show", true);
  }

  componentDidMount() {
    this.enterDiffTool();
  }

  componentWillUnmount() {
    this.leaveDiffTool();
  }

  render() {
    if (this.leftItem && this.rightItem) {
      return (
        <Main
          {...this.props}
          theme={this.props.theme}
          terria={this.props.viewState.terria}
          sourceItem={this.sourceItem}
          changeSourceItem={this.changeSourceItem}
          leftItem={this.leftItem}
          rightItem={this.rightItem}
        />
      );
    } else return null;
  }
}

interface MainPropsType extends PropsType {
  terria: Terria;
  leftItem: DiffableItem;
  rightItem: DiffableItem;
  changeSourceItem: (newSourceItem: DiffableItem) => void;
}

@observer
class Main extends React.Component<MainPropsType> {
  @observable private location?: LatLonHeight;
  @observable private _locationPickError = false;
  @observable private _isPickingNewLocation = false;

  private openLeftDatePickerButton: React.RefObject<
    HTMLButtonElement
  > = React.createRef();
  private openRightDatePickerButton: React.RefObject<
    HTMLButtonElement
  > = React.createRef();

  constructor(props: MainPropsType) {
    super(props);
  }

  @computed
  get locationPickerMessages() {
    const t = this.props.t;
    if (this._locationPickError) {
      return {
        title: t("diffTool.locationPicker.errorMessages.title"),
        beforePick: t("diffTool.locationPicker.errorMessages.beforePick"),
        afterPick: t("diffTool.locationPicker.errorMessages.afterPick")
      };
    } else if (this.location) {
      return {
        title: t(
          "diffTool.locationPicker.nextMessages.title",
          prettifyCoordinates(this.location.longitude, this.location.latitude, {
            digits: 2
          })
        ),
        beforePick: t("diffTool.locationPicker.nextMessages.beforePick"),
        afterPick: t("diffTool.locationPicker.nextMessages.afterPick")
      };
    } else {
      return {
        title: t("diffTool.locationPicker.initialMessages.title"),
        beforePick: t("diffTool.locationPicker.initialMessages.beforePick"),
        afterPick: t("diffTool.locationPicker.initialMessages.afterPick")
      };
    }
  }

  @computed
  get diffItem() {
    return this.props.leftItem;
  }

  @computed
  get diffItemName() {
    const name = this.props.sourceItem.name || "";
    const firstDate = this.leftDate;
    const secondDate = this.rightDate;
    const format = "yyyy/mm/dd";
    if (!firstDate || !secondDate) {
      return name;
    } else {
      const d1 = dateFormat(firstDate, format);
      const d2 = dateFormat(secondDate, format);
      return `${name} - difference for dates ${d1}, ${d2}`;
    }
  }

  @computed
  get diffableItemsInWorkbench(): DiffableItem[] {
    return this.props.terria.workbench.items.filter(
      item => DiffableMixin.isMixedInto(item) && item.canDiffImages
    ) as DiffableItem[];
  }

  @computed
  get previewStyle(): string | undefined {
    return this.diffItem.styleSelector?.activeStyleId;
  }

  @computed
  get diffStyle(): string | undefined {
    return this.diffItem.diffStyleId;
  }

  @computed
  get availableDiffStyles(): AvailableStyle[] {
    return filterOutUndefined(
      this.diffItem.availableDiffStyles.map(diffStyleId =>
        this.diffItem.styleSelector?.availableStyles.find(
          style => style.id === diffStyleId
        )
      )
    ) as AvailableStyle[];
  }

  @computed
  get leftDate(): JulianDate | undefined {
    return this.props.leftItem.currentDiscreteJulianDate;
  }

  @computed
  get rightDate(): JulianDate | undefined {
    return this.props.rightItem.currentDiscreteJulianDate;
  }

  @computed
  get diffLegendUrl(): string | undefined {
    return (
      this.diffStyle &&
      this.leftDate &&
      this.rightDate &&
      this.diffItem.getLegendUrlForStyle(
        this.diffStyle,
        this.leftDate,
        this.rightDate
      )
    );
  }

  @computed
  get previewLegendUrl(): string | undefined {
    return (
      this.previewStyle && this.diffItem.getLegendUrlForStyle(this.previewStyle)
    );
  }

  @action
  showItem(model: DiffableItem) {
    // We change the opacity instead of setting `show` to true/false, because
    // we want the item to be on the map for date selection to work
    hasOpacity(model) && model.setTrait(CommonStrata.user, "opacity", 0.8);
  }

  @action
  hideItem(model: DiffableItem) {
    // We change the opacity instead of setting `show` to true/false, because
    // we want the item to be on the map for date selection to work
    hasOpacity(model) && model.setTrait(CommonStrata.user, "opacity", 0);
  }

  @action.bound
  changeSourceItem(e: React.ChangeEvent<HTMLSelectElement>) {
    const newSourceItem = this.diffableItemsInWorkbench.find(
      item => item.uniqueId === e.target.value
    );
    if (newSourceItem) this.props.changeSourceItem(newSourceItem);
  }

  @action.bound
  changePreviewStyle(e: React.ChangeEvent<HTMLSelectElement>) {
    const styleId = e.target.value;
    this.props.leftItem.styleSelector?.chooseActiveStyle(
      CommonStrata.user,
      styleId
    );
    this.props.rightItem.styleSelector?.chooseActiveStyle(
      CommonStrata.user,
      styleId
    );
  }

  @action.bound
  changeDiffStyle(e: React.ChangeEvent<HTMLSelectElement>) {
    this.diffItem.setTrait(CommonStrata.user, "diffStyleId", e.target.value);
  }

  @action.bound
  onUserPickingLocation(pickingLocation: LatLonHeight) {
    this._isPickingNewLocation = true;
  }

  @action.bound
  onUserPickLocation(
    pickedFeatures: PickedFeatures,
    pickedLocation: LatLonHeight
  ) {
    const { leftItem, rightItem, t } = this.props;
    const feature = pickedFeatures.features.find(
      f =>
        doesFeatureBelongToItem(f as Feature, leftItem) ||
        doesFeatureBelongToItem(f as Feature, rightItem)
    );

    if (feature) {
      leftItem.setTimeFilterFeature(feature, pickedFeatures.providerCoords);
      rightItem.setTimeFilterFeature(feature, pickedFeatures.providerCoords);
      this.location = pickedLocation;
      this._locationPickError = false;
    } else {
      this._locationPickError = true;
    }
    this._isPickingNewLocation = false;
  }

  @action.bound
  unsetDates() {
    const { leftItem, rightItem } = this.props;
    leftItem.setTrait(CommonStrata.user, "currentTime", undefined);
    rightItem.setTrait(CommonStrata.user, "currentTime", undefined);
    this.hideItem(leftItem);
    this.hideItem(rightItem);
  }

  @action.bound
  generateDiff() {
    if (
      this.leftDate === undefined ||
      this.rightDate === undefined ||
      this.diffStyle === undefined
    ) {
      return;
    }

    const terria = this.props.terria;
    terria.overlays.remove(this.props.leftItem);
    terria.overlays.remove(this.props.rightItem);
    terria.workbench.add(this.diffItem);

    this.diffItem.setTrait(CommonStrata.user, "name", this.diffItemName);
    this.diffItem.showDiffImage(this.leftDate, this.rightDate, this.diffStyle);
    terria.showSplitter = false;
  }

  @action.bound
  resetTool() {
    const terria = this.props.terria;
    this.diffItem.clearDiffImage();
    setDefaultDiffStyle(this.diffItem);
    terria.overlays.add(this.props.leftItem);
    terria.overlays.add(this.props.rightItem);
    terria.workbench.remove(this.diffItem);
    this.props.terria.showSplitter = true;
    this.props.leftItem.setTrait(
      CommonStrata.user,
      "splitDirection",
      ImagerySplitDirection.LEFT
    );
    this.props.rightItem.setTrait(
      CommonStrata.user,
      "splitDirection",
      ImagerySplitDirection.RIGHT
    );
  }

  @action
  async setLocationFromActiveSearch() {
    // Look for any existing marker like from a search result and filter
    // imagery at that location
    const markerLocation = getMarkerLocation(this.props.terria);
    const sourceItem = this.props.sourceItem;
    if (markerLocation && Mappable.is(sourceItem)) {
      const part = sourceItem.mapItems.find(p => ImageryParts.is(p));
      const imageryProvider =
        part && ImageryParts.is(part) && part.imageryProvider;
      if (imageryProvider) {
        const promises = [
          setTimeFilterFromLocation(
            this.props.leftItem,
            markerLocation,
            imageryProvider
          ),
          setTimeFilterFromLocation(
            this.props.rightItem,
            markerLocation,
            imageryProvider
          )
        ];
        const someSuccessful = (await Promise.all(promises)).some(ok => ok);
        if (someSuccessful) {
          runInAction(() => (this.location = markerLocation));
        } else {
          // If we cannot resolve imagery at the marker location, remove it
          removeMarker(this.props.terria);
        }
      }
    }
  }

  @action
  async componentDidMount() {
    if (this.location === undefined) {
      const {
        latitude,
        longitude,
        height
      } = this.diffItem.timeFilterCoordinates;
      if (latitude !== undefined && longitude !== undefined) {
        this.location = {
          latitude,
          longitude,
          height
        };
        // remove any active search location marker to avoid showing two markers
        removeMarker(this.props.terria);
      } else {
        await this.setLocationFromActiveSearch();
      }
    }
  }

  // i want to restructure the render so that there's 2 distinct "showing diff"
  // or not states, right now intertwining them means way too many conditionals
  // that confuse the required spacing etc.
  render() {
    const { terria, viewState, sourceItem, t, theme } = this.props;
    const isShowingDiff = this.diffItem.isShowingDiff;
    const isReadyToGenerateDiff =
      this.location &&
      this.leftDate &&
      this.rightDate &&
      this.diffStyle !== undefined;

    return (
      <Text large>
        <DiffAccordion viewState={viewState} t={t}>
          <MainPanel isMapFullScreen={viewState.isMapFullScreen}>
            {isShowingDiff && (
              <>
                <Box centered left>
                  <BackButton
                    css={`
                      color: ${theme.textLight};
                      border-color: ${theme.textLight};
                    `}
                    transparentBg
                    onClick={this.resetTool}
                  >
                    <Box centered>
                      <StyledIcon
                        css="transform:rotate(90deg);"
                        light
                        styledWidth="16px"
                        glyph={GLYPHS.arrowDown}
                      />
                      <Text noFontSize>{t("general.back")}</Text>
                    </Box>
                  </BackButton>
                </Box>
                <Spacing bottom={3} />
                <Text medium textLight>
                  {t("diffTool.differenceResultsTitle")}
                </Text>
                <Spacing bottom={2} />
              </>
            )}
            <Text textLight>{t("diffTool.computeDifference")}</Text>
            <Spacing bottom={3} />
            <LocationAndDatesDisplayBox>
              <Box>
                <div>Area:</div>
                <div>
                  <Text medium bold textLightDimmed>
                    {this.location
                      ? t("diffTool.locationDisplay.locationSelected.title")
                      : t("diffTool.locationDisplay.noLocationSelected.title")}
                  </Text>
                  <Text textLight>
                    {this.location
                      ? t(
                          "diffTool.locationDisplay.locationSelected.description"
                        )
                      : t(
                          "diffTool.locationDisplay.noLocationSelected.description"
                        )}
                  </Text>
                </div>
              </Box>
              <Box>
                <div>Dates:</div>
                <Box column alignItemsFlexStart>
                  {this.leftDate && (
                    <Text large>
                      (A) {dateFormat(this.leftDate, "dd/mm/yyyy")}
                    </Text>
                  )}
                  {!this.leftDate && (
                    <LinkButton ref={this.openLeftDatePickerButton}>
                      Set date A
                    </LinkButton>
                  )}
                  {this.rightDate && (
                    <Text large>
                      (B) {dateFormat(this.rightDate, "dd/mm/yyyy")}
                    </Text>
                  )}
                  {!this.rightDate && (
                    <LinkButton ref={this.openRightDatePickerButton}>
                      Set date B
                    </LinkButton>
                  )}
                  {this.leftDate && this.rightDate && (
                    <LinkButton onClick={this.unsetDates}>
                      Change dates
                    </LinkButton>
                  )}
                </Box>
              </Box>
            </LocationAndDatesDisplayBox>
            {!isShowingDiff && (
              <>
                <Spacing bottom={4} />
                <Selector
                  value={sourceItem.uniqueId}
                  onChange={this.changeSourceItem}
                  label="Source item"
                >
                  <option disabled>Select source item</option>
                  {this.diffableItemsInWorkbench.map(item => (
                    <option key={item.uniqueId} value={item.uniqueId}>
                      {item.name}
                    </option>
                  ))}
                </Selector>
              </>
            )}
            {!isShowingDiff && (
              <>
                <Spacing bottom={4} />
                <Selector
                  spacingBottom
                  value={this.previewStyle}
                  onChange={this.changePreviewStyle}
                  label="Preview style"
                >
                  <option disabled value="">
                    {t("diffTool.choosePreview")}
                  </option>
                  {this.diffItem.styleSelector?.availableStyles.map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </Selector>
                {this.previewLegendUrl && (
                  <LegendImage width="100%" src={this.previewLegendUrl} />
                )}
              </>
            )}
            <Spacing bottom={2} />
            <Selector
              value={this.diffStyle || ""}
              onChange={this.changeDiffStyle}
              label="Difference style"
            >
              <option disabled value="">
                {t("diffTool.chooseDifference")}
              </option>
              {this.availableDiffStyles.map(style => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </Selector>
            {isShowingDiff && this.diffLegendUrl && (
              <LegendImage width="100%" src={this.diffLegendUrl} />
            )}
            {!isShowingDiff && (
              <>
                <Spacing bottom={4} />
                {!isReadyToGenerateDiff && (
                  <>
                    <Text textLight id="TJSDifferenceDisabledButtonPrompt">
                      {t("diffTool.disabledButtonPrompt")}
                    </Text>
                    <Spacing bottom={2} />
                  </>
                )}
                <GenerateButton
                  onClick={this.generateDiff}
                  disabled={!isReadyToGenerateDiff}
                  aria-describedby="TJSDifferenceDisabledButtonPrompt"
                >
                  {t("diffTool.generateDiffButtonText")}
                </GenerateButton>
              </>
            )}
          </MainPanel>
        </DiffAccordion>
        {isShowingDiff && (
          // rushing a bunch of this inline css!
          <CloseDifferenceButton
            theme={theme}
            activeStyles
            onClick={this.resetTool}
          >
            <StyledIcon light styledWidth="19px" glyph={GLYPHS.closeLight} />
          </CloseDifferenceButton>
        )}
        {!isShowingDiff && (
          <LocationPicker
            terria={terria}
            location={this.location}
            onPicking={this.onUserPickingLocation}
            onPicked={this.onUserPickLocation}
          />
        )}
        {!isShowingDiff && (
          <BottomPanel>
            <DatePicker
              title="Date Comparison A"
              item={this.props.leftItem}
              popupStyle={Styles.leftDatePickerPopup}
              externalOpenButton={this.openLeftDatePickerButton}
              onDateSet={() => this.showItem(this.props.leftItem)}
            />
            <AreaFilterSelection
              location={this.location}
              isPickingNewLocation={this._isPickingNewLocation}
            />
            <DatePicker
              title="Date Comparison B"
              item={this.props.rightItem}
              popupStyle={Styles.rightDatePickerPopup}
              externalOpenButton={this.openRightDatePickerButton}
              onDateSet={() => this.showItem(this.props.rightItem)}
            />
          </BottomPanel>
        )}
      </Text>
    );
  }
}

interface DiffAccordionProps {
  viewState: ViewState;
  t: TFunction;
}

const DiffAccordion: React.FC<DiffAccordionProps> = props => {
  const [showChildren, setShowChildren] = useState(true);
  const { t, viewState } = props;
  const theme = useTheme();
  return (
    <DiffAccordionWrapper isMapFullScreen={viewState.isMapFullScreen} column>
      <Box
        paddedVertically
        paddedHorizontally={2}
        centered
        justifySpaceBetween
        backgroundColor={theme.colorSplitter}
      >
        <Box centered>
          <StyledIcon styledWidth="20px" light glyph={GLYPHS.difference} />
          <Spacing right={1} />
          {/* font-size is non standard with what we have so far in terria,
              lineheight as well to hit nonstandard paddings */}
          <Text css={"font-size: 17px;line-height: 26px;"} textLight>
            {t("diffTool.title")}
          </Text>
        </Box>
        {/* margin-right 5px for the padded button offset - larger click area
            but visible should be inline with rest of box */}
        <Box centered css={"margin-right:-5px;"}>
          <RawButton onClick={() => viewState.closeTool()}>
            <Text textLight small semiBold uppercase>
              {t("diffTool.exit")}
            </Text>
          </RawButton>
          <Spacing right={1} />
          <RawButton onClick={() => setShowChildren(!showChildren)}>
            <Box paddedRatio={1} centered>
              <StyledIcon
                styledWidth="12px"
                light
                glyph={showChildren ? GLYPHS.opened : GLYPHS.closed}
              />
            </Box>
          </RawButton>
        </Box>
      </Box>
      {showChildren && props.children}
    </DiffAccordionWrapper>
  );
};

const DiffAccordionWrapper = styled(Box).attrs({
  column: true,
  positionAbsolute: true,
  styledWidth: "340px"
  // charcoalGreyBg: true
})`
  top: 70px;
  left: 0px;
  min-height: 220px;
  background: ${p => p.theme.dark};
  margin-left: ${props =>
    props.isMapFullScreen ? 16 : parseInt(props.theme.workbenchWidth) + 40}px;
  transition: margin-left 0.25s;
`;

const MainPanel = styled(Box).attrs({
  column: true,
  paddedRatio: 2
})`
  background-color: ${p => p.theme.darkWithOverlay};
`;

const BackButton = styled(Button).attrs({
  secondary: true
})``;

const CloseDifferenceButton = styled(RawButton)`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 60px;

  border-radius: 50%;
  padding: 13px;
  color: ${p => p.theme.textLight};
  border-color: ${p => p.theme.textLight};
  background-color: ${p => p.theme.colorPrimary};
`;

const GenerateButton = styled(Button).attrs({
  primary: true,
  splitter: true,
  fullWidth: true
})``;

const Selector = (props: any) => (
  <Box fullWidth column>
    <label>
      <Text textLight>{props.label}:</Text>
      <Spacing bottom={1} />
      <Select {...props}>{props.children}</Select>
      {props.spacingBottom && <Spacing bottom={2} />}
    </label>
  </Box>
);

const BottomPanel = styled(Box).attrs({
  centered: true,
  positionAbsolute: true,
  fullWidth: true,
  styledHeight: "80px"
})`
  background: ${p => p.theme.dark};
  z-index: 99999;
  left: 0;
  bottom: 0;

  > div {
    flex: 1;
    display: flex;
    justify-content: center;
    max-height: 64px;
  }
`;

const AreaFilterSelection = (props: {
  location?: LatLonHeight;
  isPickingNewLocation: boolean;
}) => {
  const { location, isPickingNewLocation } = props;
  let locationText = "-";
  if (location) {
    const { longitude, latitude } = prettifyCoordinates(
      location.longitude,
      location.latitude,
      {
        digits: 2
      }
    );
    locationText = `${longitude} ${latitude}`;
  }
  const progressComponent = (
    <Text textLight extraExtraLarge bold>
      <Loader message={`Querying ${location ? "new" : ""} position...`} />
    </Text>
  );

  return (
    <Box column centered>
      <Text textLight semiBold>
        Area filter selection
      </Text>
      {isPickingNewLocation && progressComponent}
      {!isPickingNewLocation && (
        <Text
          textLight
          extraExtraLarge
          bold
          css={"min-height: 40px; line-height: 40px;"}
        >
          {locationText}
        </Text>
      )}
    </Box>
  );
};

const LocationAndDatesDisplayBox = styled(Box).attrs({
  column: true,
  charcoalGreyBg: true
})`
  color: ${p => p.theme.textLight};
  padding: 15px;
  > ${Box}:first-child {
    margin-bottom: 13px;
  }
  > div > div:first-child {
    /* The labels */
    margin-right: 10px;
    min-width: 57px;
  }
`;

const LegendImage = function(props: any) {
  return (
    <img
      {...props}
      // Show the legend only if it loads successfully, so we start out hidden
      style={{ display: "none", marginTop: "4px" }}
      // @ts-ignore
      onLoad={e => (e.target.style.display = "block")}
      // @ts-ignore
      onError={e => (e.target.style.display = "none")}
    />
  );
};

const LinkButton = styled(Button)`
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  text-decoration: underline;
`;

async function createSplitItem(
  sourceItem: DiffableItem,
  splitDirection: ImagerySplitDirection
): Promise<DiffableItem> {
  const terria = sourceItem.terria;
  const ref = new SplitItemReference(createGuid(), terria);
  ref.setTrait(CommonStrata.user, "splitSourceItemId", sourceItem.uniqueId);
  terria.addModel(ref);
  await ref.loadReference();
  return runInAction(() => {
    if (ref.target === undefined) {
      throw Error("failed to split item");
    }
    const newItem = ref.target as DiffableItem;
    newItem.setTrait(CommonStrata.user, "show", true);
    newItem.setTrait(CommonStrata.user, "splitDirection", splitDirection);
    newItem.setTrait(CommonStrata.user, "currentTime", undefined);
    newItem.setTrait(CommonStrata.user, "initialTimeSource", "none");
    if (hasOpacity(newItem)) {
      // We want to show the item on the map only after date selection. At the
      // same time we cannot set `show` to false because if we
      // do so, date picking which relies on feature picking, will not work. So
      // we simply set the opacity of the item to 0.
      newItem.setTrait(CommonStrata.user, "opacity", 0);
    }

    setDefaultDiffStyle(newItem);

    // Set the default style to true color style if it exists
    const trueColor = newItem.styleSelector?.availableStyles.find(
      style => style.name.search(/true/i) >= 0
    );
    if (trueColor) {
      newItem.styleSelector?.chooseActiveStyle(CommonStrata.user, trueColor.id);
    }

    terria.overlays.add(newItem);
    return newItem;
  });
}

/**
 * If the item has only one available diff style, auto-select it
 */
function setDefaultDiffStyle(item: DiffableItem) {
  if (item.diffStyleId === undefined && item.availableDiffStyles.length === 1) {
    item.setTrait(
      CommonStrata.user,
      "diffStyleId",
      item.availableDiffStyles[0]
    );
  }
}

function removeSplitItem(item: DiffableItem) {
  const terria = item.terria;
  terria.overlays.remove(item);
  if (item.sourceReference && terria.workbench.contains(item) === false) {
    terria.removeModelReferences(item.sourceReference);
  }
}

function doesFeatureBelongToItem(
  feature: Feature,
  item: DiffableItem
): Boolean {
  if (!Mappable.is(item)) return false;
  const imageryProvider = feature.imageryLayer?.imageryProvider;
  if (imageryProvider === undefined) return false;
  return (
    item.mapItems.find(
      m => ImageryParts.is(m) && m.imageryProvider === imageryProvider
    ) !== undefined
  );
}

function setTimeFilterFromLocation(
  item: DiffableItem,
  location: LatLonHeight,
  im: ImageryProvider
): Promise<boolean> {
  const carto = new Cartographic(
    CesiumMath.toRadians(location.longitude),
    CesiumMath.toRadians(location.latitude)
  );
  // We just need to set this to a high enough level supported by the service
  const level = 30;
  const tile = im.tilingScheme.positionToTileXY(carto, level);
  return item.setTimeFilterFromLocation({
    position: {
      latitude: location.latitude,
      longitude: location.longitude,
      height: location.height
    },
    tileCoords: {
      x: tile.x,
      y: tile.y,
      level
    }
  });
}

function hasOpacity(
  model: any
): model is HasTrait<RasterLayerTraits, "opacity"> {
  return hasTraits(model, RasterLayerTraits, "opacity");
}

export default hoistStatics(withTranslation()(withTheme(DiffTool)), DiffTool);
