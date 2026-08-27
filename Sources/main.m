#import <Cocoa/Cocoa.h>
#import <ServiceManagement/ServiceManagement.h>

typedef NS_ENUM(NSInteger, PetMode) {
    PetModeIdle,
    PetModeWalkRight,
    PetModeWalkLeft,
    PetModeWaving,
    PetModeJumping,
    PetModeHissing,
    PetModeWaiting,
    PetModeWorking,
    PetModeReview,
    PetModeProud,
    PetModeSleeping
};

typedef NS_ENUM(NSInteger, PetVisibilityMode) {
    PetVisibilityModeAlwaysShow = 0,
    PetVisibilityModeAlwaysHide = 1,
    PetVisibilityModeHideInFullscreen = 2
};

typedef NS_ENUM(NSInteger, PetActivityLevel) {
    PetActivityLevelDefault = 0,
    PetActivityLevelLively = 1,
    PetActivityLevelQuiet = 2
};

static const CGFloat kCellWidth = 192.0;
static const CGFloat kCellHeight = 208.0;
static const CGFloat kStandardPetScale = 0.75;
static const CGFloat kMinimumPetScale = 0.5625;
static const CGFloat kMaximumPetScale = 1.125;
static const CGFloat kSpeechBubbleWidth = 132.0;
static const CGFloat kSpeechBubbleHeight = 62.0;
static const NSTimeInterval kAutomaticSleepDelay = 60.0;
static const NSTimeInterval kDragLongPressDelay = 0.25;
static const NSInteger kDragLiftTicks = 7;
static const NSInteger kDragDropTicks = 8;

static NSInteger RowForMode(PetMode mode) { return mode == PetModeProud ? 6 : (NSInteger)mode; }

static NSInteger FrameCountForMode(PetMode mode) {
    switch (mode) {
        case PetModeIdle: return 6;
        case PetModeWalkRight:
        case PetModeWalkLeft:
        case PetModeHissing: return 8;
        case PetModeWaving: return 4;
        case PetModeJumping: return 5;
        case PetModeWaiting:
        case PetModeWorking:
        case PetModeReview:
        case PetModeProud:
        case PetModeSleeping: return 6;
    }
}

static BOOL IsTransientMode(PetMode mode) {
    return mode != PetModeIdle &&
           mode != PetModeWalkRight &&
           mode != PetModeWalkLeft &&
           mode != PetModeSleeping;
}

static NSInteger RandomBetween(NSInteger lower, NSInteger upper) {
    return lower + (NSInteger)arc4random_uniform((uint32_t)(upper - lower + 1));
}

static NSArray<NSDictionary<NSString *, id> *> *GiftDefinitions(void) {
    static NSArray<NSDictionary<NSString *, id> *> *definitions;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        definitions = @[
            @{@"id": @"screw", @"name": @"黄铜发条钥匙", @"asset": @"winding-key.png", @"weight": @40,
              @"note": @"被擦得亮晶晶的。多涅坚称只是顺手捡到。"},
            @{@"id": @"feather", @"name": @"黑金蝴蝶结", @"asset": @"black-gold-bow.png", @"weight": @30,
              @"note": @"端庄又可爱，和某位傲娇淑女十分相配。"},
            @{@"id": @"gear", @"name": @"齿轮蔷薇", @"asset": @"clockwork-rose.png", @"weight": @22,
              @"note": @"花瓣会在光下微微转动，她似乎很中意。"},
            @{@"id": @"ruby", @"name": @"红宝石胸针", @"asset": @"ruby-brooch.png", @"weight": @8,
              @"note": @"罕见的闪亮收藏。她展示时明显格外得意。"}
        ];
    });
    return definitions;
}

static NSImage *GiftImageForDefinition(NSDictionary<NSString *, id> *gift) {
    static NSMutableDictionary<NSString *, NSImage *> *cache;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ cache = [NSMutableDictionary dictionary]; });
    NSString *asset = gift[@"asset"];
    if (asset.length == 0) return nil;
    NSImage *cached = cache[asset];
    if (cached) return cached;
    NSURL *url = [NSBundle.mainBundle URLForResource:asset.stringByDeletingPathExtension
                                      withExtension:asset.pathExtension
                                       subdirectory:@"Gifts"];
    NSImage *image = url ? [[NSImage alloc] initWithContentsOfURL:url] : nil;
    if (image) cache[asset] = image;
    return image;
}

static NSDictionary<NSString *, id> *RandomGiftDefinition(void) {
    NSInteger roll = RandomBetween(1, 100);
    NSInteger cumulative = 0;
    for (NSDictionary<NSString *, id> *gift in GiftDefinitions()) {
        cumulative += [gift[@"weight"] integerValue];
        if (roll <= cumulative) return gift;
    }
    return GiftDefinitions().firstObject;
}

@interface PetStats : NSObject
@property(nonatomic, readonly) NSTimeInterval todayCompanionSeconds;
@property(nonatomic, readonly) NSTimeInterval totalCompanionSeconds;
@property(nonatomic, readonly) NSInteger todayInteractions;
@property(nonatomic, readonly) NSInteger totalInteractions;
@property(nonatomic, readonly) NSInteger todayCaught;
@property(nonatomic, readonly) NSInteger totalCaught;
@property(nonatomic, readonly) NSInteger todayMissed;
@property(nonatomic, readonly) NSInteger totalMissed;
@property(nonatomic, readonly) NSInteger todayHisses;
@property(nonatomic, readonly) NSInteger totalHisses;
@property(nonatomic, readonly) NSInteger todaySleeps;
@property(nonatomic, readonly) NSInteger totalSleeps;
@property(nonatomic, readonly) NSInteger totalGifts;
@property(nonatomic, readonly) NSInteger discoveredGiftKinds;
- (void)addVisibleSeconds:(NSTimeInterval)seconds;
- (void)recordInteraction;
- (void)recordCaught;
- (void)recordMissed;
- (void)recordHiss;
- (void)recordSleep;
- (void)recordGiftWithIdentifier:(NSString *)identifier;
- (NSInteger)giftCountForIdentifier:(NSString *)identifier;
- (NSDate *)firstFoundDateForIdentifier:(NSString *)identifier;
- (void)save;
- (void)resetAll;
@end

static NSString *CurrentStatsDayKey(void) {
    NSDateComponents *components = [NSCalendar.currentCalendar components:NSCalendarUnitYear |
                                                                        NSCalendarUnitMonth |
                                                                        NSCalendarUnitDay
                                                               fromDate:NSDate.date];
    return [NSString stringWithFormat:@"%04ld-%02ld-%02ld",
            (long)components.year, (long)components.month, (long)components.day];
}

@implementation PetStats {
    NSString *_dayKey;
    NSTimeInterval _todayCompanionSeconds;
    NSTimeInterval _totalCompanionSeconds;
    NSInteger _todayInteractions;
    NSInteger _totalInteractions;
    NSInteger _todayCaught;
    NSInteger _totalCaught;
    NSInteger _todayMissed;
    NSInteger _totalMissed;
    NSInteger _todayHisses;
    NSInteger _totalHisses;
    NSInteger _todaySleeps;
    NSInteger _totalSleeps;
    NSMutableDictionary<NSString *, NSNumber *> *_giftCounts;
    NSMutableDictionary<NSString *, NSDate *> *_giftFirstFoundDates;
    NSTimeInterval _secondsSinceSave;
}

- (instancetype)init {
    self = [super init];
    if (!self) return nil;
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    _dayKey = [defaults stringForKey:@"statsDayKey"] ?: CurrentStatsDayKey();
    _todayCompanionSeconds = [defaults doubleForKey:@"statsTodayCompanionSeconds"];
    _totalCompanionSeconds = [defaults doubleForKey:@"statsTotalCompanionSeconds"];
    _todayInteractions = [defaults integerForKey:@"statsTodayInteractions"];
    _totalInteractions = [defaults integerForKey:@"statsTotalInteractions"];
    _todayCaught = [defaults integerForKey:@"statsTodayCaught"];
    _totalCaught = [defaults integerForKey:@"statsTotalCaught"];
    _todayMissed = [defaults integerForKey:@"statsTodayMissed"];
    _totalMissed = [defaults integerForKey:@"statsTotalMissed"];
    _todayHisses = [defaults integerForKey:@"statsTodayHisses"];
    _totalHisses = [defaults integerForKey:@"statsTotalHisses"];
    _todaySleeps = [defaults integerForKey:@"statsTodaySleeps"];
    _totalSleeps = [defaults integerForKey:@"statsTotalSleeps"];
    _giftCounts = [[defaults dictionaryForKey:@"giftCounts"] mutableCopy] ?: [NSMutableDictionary dictionary];
    _giftFirstFoundDates = [[defaults dictionaryForKey:@"giftFirstFoundDates"] mutableCopy] ?: [NSMutableDictionary dictionary];
    [self ensureCurrentDay];
    return self;
}

- (void)ensureCurrentDay {
    NSString *currentDay = CurrentStatsDayKey();
    if ([_dayKey isEqualToString:currentDay]) return;
    _dayKey = currentDay;
    _todayCompanionSeconds = 0;
    _todayInteractions = 0;
    _todayCaught = 0;
    _todayMissed = 0;
    _todayHisses = 0;
    _todaySleeps = 0;
    [self save];
}

- (NSTimeInterval)todayCompanionSeconds { [self ensureCurrentDay]; return _todayCompanionSeconds; }
- (NSTimeInterval)totalCompanionSeconds { return _totalCompanionSeconds; }
- (NSInteger)todayInteractions { [self ensureCurrentDay]; return _todayInteractions; }
- (NSInteger)totalInteractions { return _totalInteractions; }
- (NSInteger)todayCaught { [self ensureCurrentDay]; return _todayCaught; }
- (NSInteger)totalCaught { return _totalCaught; }
- (NSInteger)todayMissed { [self ensureCurrentDay]; return _todayMissed; }
- (NSInteger)totalMissed { return _totalMissed; }
- (NSInteger)todayHisses { [self ensureCurrentDay]; return _todayHisses; }
- (NSInteger)totalHisses { return _totalHisses; }
- (NSInteger)todaySleeps { [self ensureCurrentDay]; return _todaySleeps; }
- (NSInteger)totalSleeps { return _totalSleeps; }
- (NSInteger)totalGifts {
    NSInteger total = 0;
    for (NSNumber *count in _giftCounts.allValues) total += count.integerValue;
    return total;
}
- (NSInteger)discoveredGiftKinds { return _giftCounts.count; }

- (void)addVisibleSeconds:(NSTimeInterval)seconds {
    if (seconds <= 0.0 || seconds > 1.5) return;
    [self ensureCurrentDay];
    _todayCompanionSeconds += seconds;
    _totalCompanionSeconds += seconds;
    _secondsSinceSave += seconds;
    if (_secondsSinceSave >= 10.0) [self save];
}

- (void)recordInteraction { [self ensureCurrentDay]; _todayInteractions += 1; _totalInteractions += 1; [self save]; }
- (void)recordCaught { [self ensureCurrentDay]; _todayCaught += 1; _totalCaught += 1; [self save]; }
- (void)recordMissed { [self ensureCurrentDay]; _todayMissed += 1; _totalMissed += 1; [self save]; }
- (void)recordHiss { [self ensureCurrentDay]; _todayHisses += 1; _totalHisses += 1; [self save]; }
- (void)recordSleep { [self ensureCurrentDay]; _todaySleeps += 1; _totalSleeps += 1; [self save]; }
- (void)recordGiftWithIdentifier:(NSString *)identifier {
    if (identifier.length == 0) return;
    NSInteger count = [_giftCounts[identifier] integerValue] + 1;
    _giftCounts[identifier] = @(count);
    if (!_giftFirstFoundDates[identifier]) _giftFirstFoundDates[identifier] = NSDate.date;
    [self save];
}
- (NSInteger)giftCountForIdentifier:(NSString *)identifier {
    return [_giftCounts[identifier] integerValue];
}
- (NSDate *)firstFoundDateForIdentifier:(NSString *)identifier {
    return _giftFirstFoundDates[identifier];
}

- (void)save {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    [defaults setObject:_dayKey forKey:@"statsDayKey"];
    [defaults setDouble:_todayCompanionSeconds forKey:@"statsTodayCompanionSeconds"];
    [defaults setDouble:_totalCompanionSeconds forKey:@"statsTotalCompanionSeconds"];
    [defaults setInteger:_todayInteractions forKey:@"statsTodayInteractions"];
    [defaults setInteger:_totalInteractions forKey:@"statsTotalInteractions"];
    [defaults setInteger:_todayCaught forKey:@"statsTodayCaught"];
    [defaults setInteger:_totalCaught forKey:@"statsTotalCaught"];
    [defaults setInteger:_todayMissed forKey:@"statsTodayMissed"];
    [defaults setInteger:_totalMissed forKey:@"statsTotalMissed"];
    [defaults setInteger:_todayHisses forKey:@"statsTodayHisses"];
    [defaults setInteger:_totalHisses forKey:@"statsTotalHisses"];
    [defaults setInteger:_todaySleeps forKey:@"statsTodaySleeps"];
    [defaults setInteger:_totalSleeps forKey:@"statsTotalSleeps"];
    [defaults setObject:_giftCounts.copy forKey:@"giftCounts"];
    [defaults setObject:_giftFirstFoundDates.copy forKey:@"giftFirstFoundDates"];
    _secondsSinceSave = 0.0;
}

- (void)resetAll {
    _dayKey = CurrentStatsDayKey();
    _todayCompanionSeconds = 0;
    _totalCompanionSeconds = 0;
    _todayInteractions = 0;
    _totalInteractions = 0;
    _todayCaught = 0;
    _totalCaught = 0;
    _todayMissed = 0;
    _totalMissed = 0;
    _todayHisses = 0;
    _totalHisses = 0;
    _todaySleeps = 0;
    _totalSleeps = 0;
    [_giftCounts removeAllObjects];
    [_giftFirstFoundDates removeAllObjects];
    [self save];
}
@end

static NSString *FormatCompanionDuration(NSTimeInterval seconds) {
    NSInteger totalMinutes = (NSInteger)floor(MAX(0.0, seconds) / 60.0);
    NSInteger hours = totalMinutes / 60;
    NSInteger minutes = totalMinutes % 60;
    if (hours > 0) return [NSString stringWithFormat:@"%ld 小时 %ld 分钟", (long)hours, (long)minutes];
    if (minutes > 0) return [NSString stringWithFormat:@"%ld 分钟", (long)minutes];
    return @"不到 1 分钟";
}

static NSTextField *StatsLabel(NSRect frame, NSString *text, NSFont *font, NSColor *color) {
    NSTextField *label = [[NSTextField alloc] initWithFrame:frame];
    label.stringValue = text ?: @"";
    label.font = font;
    label.textColor = color;
    label.bezeled = NO;
    label.drawsBackground = NO;
    label.editable = NO;
    label.selectable = NO;
    label.lineBreakMode = NSLineBreakByTruncatingTail;
    return label;
}

static NSBox *StatsCard(NSView *parent, NSRect frame, NSColor *color) {
    NSBox *box = [[NSBox alloc] initWithFrame:frame];
    box.boxType = NSBoxCustom;
    box.borderWidth = 0.0;
    box.cornerRadius = 14.0;
    box.fillColor = color;
    box.contentViewMargins = NSZeroSize;
    [parent addSubview:box];
    return box;
}

static NSTextField *AddTodayCard(NSView *parent,
                                  NSRect frame,
                                  NSString *icon,
                                  NSString *title,
                                  NSColor *color) {
    NSBox *card = StatsCard(parent, frame, [color colorWithAlphaComponent:0.11]);
    [card addSubview:StatsLabel(NSMakeRect(16, 20, 28, 30), icon,
                                [NSFont systemFontOfSize:23.0], NSColor.labelColor)];
    [card addSubview:StatsLabel(NSMakeRect(52, 37, frame.size.width - 66, 18), title,
                                [NSFont systemFontOfSize:12.0 weight:NSFontWeightMedium],
                                NSColor.secondaryLabelColor)];
    NSTextField *value = StatsLabel(NSMakeRect(52, 12, frame.size.width - 66, 25), @"—",
                                    [NSFont systemFontOfSize:17.0 weight:NSFontWeightSemibold],
                                    NSColor.labelColor);
    [card addSubview:value];
    return value;
}

static NSTextField *AddTotalMetric(NSView *parent,
                                    CGFloat x,
                                    CGFloat y,
                                    NSString *title,
                                    CGFloat width) {
    [parent addSubview:StatsLabel(NSMakeRect(x, y + 23, width, 17), title,
                                  [NSFont systemFontOfSize:11.0 weight:NSFontWeightMedium],
                                  NSColor.secondaryLabelColor)];
    NSTextField *value = StatsLabel(NSMakeRect(x, y, width, 23), @"—",
                                    [NSFont systemFontOfSize:15.0 weight:NSFontWeightSemibold],
                                    NSColor.labelColor);
    [parent addSubview:value];
    return value;
}

@interface StatsWindowController : NSObject
- (instancetype)initWithStats:(PetStats *)stats;
- (void)show;
- (void)refreshIfVisible;
@end

@implementation StatsWindowController {
    PetStats *_stats;
    NSWindow *_window;
    NSTextField *_todayCompanionLabel;
    NSTextField *_todayInteractionsLabel;
    NSTextField *_todayPounceLabel;
    NSTextField *_todayHissLabel;
    NSTextField *_todaySleepLabel;
    NSTextField *_totalCompanionLabel;
    NSTextField *_totalInteractionsLabel;
    NSTextField *_totalCaughtLabel;
    NSTextField *_totalMissedLabel;
    NSTextField *_totalHissLabel;
    NSTextField *_totalSleepLabel;
    NSSegmentedControl *_sectionControl;
    NSVisualEffectView *_giftView;
    NSTextField *_giftSummaryLabel;
    NSMutableArray<NSImageView *> *_giftImageViews;
    NSMutableArray<NSTextField *> *_giftPlaceholderLabels;
    NSMutableArray<NSTextField *> *_giftNameLabels;
    NSMutableArray<NSTextField *> *_giftCountLabels;
    NSMutableArray<NSTextField *> *_giftDateLabels;
    NSMutableArray<NSTextField *> *_giftNoteLabels;
    NSArray<NSView *> *_journalSubviews;
}

- (instancetype)initWithStats:(PetStats *)stats {
    self = [super init];
    if (!self) return nil;
    _stats = stats;
    return self;
}

- (void)buildWindowIfNeeded {
    if (_window) return;
    _window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 500, 660)
                                         styleMask:NSWindowStyleMaskTitled |
                                                   NSWindowStyleMaskClosable |
                                                   NSWindowStyleMaskMiniaturizable
                                           backing:NSBackingStoreBuffered
                                             defer:NO];
    _window.title = @"多涅小记";
    _window.releasedWhenClosed = NO;
    _window.titlebarAppearsTransparent = YES;

    NSVisualEffectView *root = [[NSVisualEffectView alloc] initWithFrame:_window.contentView.bounds];
    root.material = NSVisualEffectMaterialSidebar;
    root.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    root.state = NSVisualEffectStateActive;
    _window.contentView = root;

    NSBox *avatar = StatsCard(root, NSMakeRect(28, 576, 54, 54),
                              [NSColor colorWithRed:0.94 green:0.87 blue:0.98 alpha:0.96]);
    avatar.cornerRadius = 27.0;
    NSTextField *paw = StatsLabel(NSMakeRect(10, 10, 34, 34), @"🐾",
                                  [NSFont systemFontOfSize:25.0], NSColor.labelColor);
    paw.alignment = NSTextAlignmentCenter;
    [avatar addSubview:paw];
    [root addSubview:StatsLabel(NSMakeRect(98, 598, 360, 32), @"多涅小记",
                                [NSFont systemFontOfSize:26.0 weight:NSFontWeightBold], NSColor.labelColor)];
    [root addSubview:StatsLabel(NSMakeRect(99, 576, 360, 20), @"悄悄记下和你待在一起的日子",
                                [NSFont systemFontOfSize:13.0], NSColor.secondaryLabelColor)];

    NSBox *companionCard = StatsCard(root, NSMakeRect(28, 442, 444, 72),
                                     [NSColor.systemPurpleColor colorWithAlphaComponent:0.13]);
    [companionCard addSubview:StatsLabel(NSMakeRect(18, 25, 34, 32), @"♡",
                                         [NSFont systemFontOfSize:27.0 weight:NSFontWeightLight],
                                         NSColor.systemPurpleColor)];
    [companionCard addSubview:StatsLabel(NSMakeRect(62, 40, 180, 18), @"今天的陪伴",
                                         [NSFont systemFontOfSize:12.0 weight:NSFontWeightMedium],
                                         NSColor.secondaryLabelColor)];
    _todayCompanionLabel = StatsLabel(NSMakeRect(62, 13, 355, 29), @"—",
                                      [NSFont systemFontOfSize:21.0 weight:NSFontWeightSemibold],
                                      NSColor.labelColor);
    [companionCard addSubview:_todayCompanionLabel];

    [root addSubview:StatsLabel(NSMakeRect(29, 407, 200, 24), @"今天发生了什么",
                                [NSFont systemFontOfSize:16.0 weight:NSFontWeightSemibold], NSColor.labelColor)];
    _todayInteractionsLabel = AddTodayCard(root, NSMakeRect(28, 331, 216, 64), @"🐾", @"互动", NSColor.systemBlueColor);
    _todayPounceLabel = AddTodayCard(root, NSMakeRect(256, 331, 216, 64), @"⚡", @"扑扑记录", NSColor.systemOrangeColor);
    _todayHissLabel = AddTodayCard(root, NSMakeRect(28, 255, 216, 64), @"💢", @"哈气", NSColor.systemRedColor);
    _todaySleepLabel = AddTodayCard(root, NSMakeRect(256, 255, 216, 64), @"☾", @"睡觉", NSColor.systemIndigoColor);

    [root addSubview:StatsLabel(NSMakeRect(29, 219, 200, 24), @"从相遇到现在",
                                [NSFont systemFontOfSize:16.0 weight:NSFontWeightSemibold], NSColor.labelColor)];
    NSBox *totalCard = StatsCard(root, NSMakeRect(28, 82, 444, 125),
                                 [NSColor.labelColor colorWithAlphaComponent:0.055]);
    CGFloat metricWidth = 124.0;
    _totalCompanionLabel = AddTotalMetric(totalCard, 18, 70, @"陪伴时间", metricWidth);
    _totalInteractionsLabel = AddTotalMetric(totalCard, 160, 70, @"互动", metricWidth);
    _totalCaughtLabel = AddTotalMetric(totalCard, 302, 70, @"抓到鼠标", metricWidth);
    _totalMissedLabel = AddTotalMetric(totalCard, 18, 16, @"扑了个空", metricWidth);
    _totalHissLabel = AddTotalMetric(totalCard, 160, 16, @"哈气", metricWidth);
    _totalSleepLabel = AddTotalMetric(totalCard, 302, 16, @"睡觉", metricWidth);

    [root addSubview:StatsLabel(NSMakeRect(29, 51, 300, 18), @"🔒  记录只留在这台 Mac 上",
                                [NSFont systemFontOfSize:11.0], NSColor.tertiaryLabelColor)];
    NSButton *resetButton = [[NSButton alloc] initWithFrame:NSMakeRect(356, 42, 116, 30)];
    resetButton.title = @"清空记录…";
    resetButton.bezelStyle = NSBezelStyleRounded;
    resetButton.target = self;
    resetButton.action = @selector(resetStats:);
    [root addSubview:resetButton];

    _journalSubviews = root.subviews.copy;
    _giftView = [[NSVisualEffectView alloc] initWithFrame:root.bounds];
    _giftView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _giftView.material = NSVisualEffectMaterialSidebar;
    _giftView.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    _giftView.state = NSVisualEffectStateActive;
    _giftView.hidden = YES;
    [root addSubview:_giftView];

    NSBox *giftAvatar = StatsCard(_giftView, NSMakeRect(28, 576, 54, 54),
                                  [NSColor colorWithRed:1.0 green:0.91 blue:0.76 alpha:0.96]);
    giftAvatar.cornerRadius = 27.0;
    NSTextField *giftPaw = StatsLabel(NSMakeRect(10, 10, 34, 34), @"🎁",
                                      [NSFont systemFontOfSize:25.0], NSColor.labelColor);
    giftPaw.alignment = NSTextAlignmentCenter;
    [giftAvatar addSubview:giftPaw];
    [_giftView addSubview:StatsLabel(NSMakeRect(98, 598, 360, 32), @"多涅的小箱子",
                                     [NSFont systemFontOfSize:26.0 weight:NSFontWeightBold], NSColor.labelColor)];
    [_giftView addSubview:StatsLabel(NSMakeRect(99, 576, 360, 20), @"她坚称这些东西不是送给你的",
                                     [NSFont systemFontOfSize:13.0], NSColor.secondaryLabelColor)];

    _giftSummaryLabel = StatsLabel(NSMakeRect(28, 452, 444, 30), @"—",
                                   [NSFont systemFontOfSize:17.0 weight:NSFontWeightSemibold], NSColor.labelColor);
    _giftSummaryLabel.alignment = NSTextAlignmentCenter;
    [_giftView addSubview:_giftSummaryLabel];
    _giftImageViews = [NSMutableArray array];
    _giftPlaceholderLabels = [NSMutableArray array];
    _giftNameLabels = [NSMutableArray array];
    _giftCountLabels = [NSMutableArray array];
    _giftDateLabels = [NSMutableArray array];
    _giftNoteLabels = [NSMutableArray array];
    NSArray<NSValue *> *giftFrames = @[
        [NSValue valueWithRect:NSMakeRect(28, 273, 216, 150)],
        [NSValue valueWithRect:NSMakeRect(256, 273, 216, 150)],
        [NSValue valueWithRect:NSMakeRect(28, 105, 216, 150)],
        [NSValue valueWithRect:NSMakeRect(256, 105, 216, 150)]
    ];
    for (NSInteger index = 0; index < (NSInteger)GiftDefinitions().count; index++) {
        NSRect frame = giftFrames[index].rectValue;
        NSBox *card = StatsCard(_giftView, frame,
                                [NSColor.labelColor colorWithAlphaComponent:0.055]);
        NSImageView *icon = [[NSImageView alloc] initWithFrame:NSMakeRect(15, 87, 49, 49)];
        icon.imageScaling = NSImageScaleProportionallyUpOrDown;
        [card addSubview:icon];
        NSTextField *placeholder = StatsLabel(NSMakeRect(15, 87, 49, 49), @"？",
                                              [NSFont systemFontOfSize:34.0], NSColor.labelColor);
        placeholder.alignment = NSTextAlignmentCenter;
        [card addSubview:placeholder];
        NSTextField *name = StatsLabel(NSMakeRect(72, 112, 128, 22), @"尚未发现",
                                       [NSFont systemFontOfSize:15.0 weight:NSFontWeightSemibold], NSColor.labelColor);
        [card addSubview:name];
        NSTextField *count = StatsLabel(NSMakeRect(72, 87, 128, 20), @"—",
                                        [NSFont systemFontOfSize:13.0], NSColor.secondaryLabelColor);
        [card addSubview:count];
        NSTextField *date = StatsLabel(NSMakeRect(16, 57, 184, 18), @"首次发现：—",
                                       [NSFont systemFontOfSize:11.0], NSColor.tertiaryLabelColor);
        [card addSubview:date];
        NSTextField *note = StatsLabel(NSMakeRect(16, 12, 184, 38), @"多涅还没有找到它。",
                                       [NSFont systemFontOfSize:11.0], NSColor.secondaryLabelColor);
        note.lineBreakMode = NSLineBreakByWordWrapping;
        note.maximumNumberOfLines = 2;
        note.usesSingleLineMode = NO;
        [card addSubview:note];
        [_giftImageViews addObject:icon];
        [_giftPlaceholderLabels addObject:placeholder];
        [_giftNameLabels addObject:name];
        [_giftCountLabels addObject:count];
        [_giftDateLabels addObject:date];
        [_giftNoteLabels addObject:note];
    }
    [_giftView addSubview:StatsLabel(NSMakeRect(29, 51, 300, 18), @"🔒  收藏只留在这台 Mac 上",
                                     [NSFont systemFontOfSize:11.0], NSColor.tertiaryLabelColor)];

    _sectionControl = [[NSSegmentedControl alloc] initWithFrame:NSMakeRect(160, 537, 180, 28)];
    _sectionControl.segmentCount = 2;
    [_sectionControl setLabel:@"小记" forSegment:0];
    [_sectionControl setLabel:@"小箱子" forSegment:1];
    ((NSSegmentedCell *)_sectionControl.cell).trackingMode = NSSegmentSwitchTrackingSelectOne;
    _sectionControl.target = self;
    _sectionControl.action = @selector(changeSection:);
    _sectionControl.selectedSegment = 0;
    [root addSubview:_sectionControl];
    [_window center];
}

- (void)refresh {
    [_stats save];
    _todayCompanionLabel.stringValue = FormatCompanionDuration(_stats.todayCompanionSeconds);
    _todayInteractionsLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.todayInteractions];
    _todayPounceLabel.stringValue = [NSString stringWithFormat:@"抓到 %ld · 扑空 %ld",
                                     (long)_stats.todayCaught, (long)_stats.todayMissed];
    _todayHissLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.todayHisses];
    _todaySleepLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.todaySleeps];
    _totalCompanionLabel.stringValue = FormatCompanionDuration(_stats.totalCompanionSeconds);
    _totalInteractionsLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.totalInteractions];
    _totalCaughtLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.totalCaught];
    _totalMissedLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.totalMissed];
    _totalHissLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.totalHisses];
    _totalSleepLabel.stringValue = [NSString stringWithFormat:@"%ld 次", (long)_stats.totalSleeps];
    _giftSummaryLabel.stringValue = [NSString stringWithFormat:@"已发现 %ld / %ld · 共收藏 %ld 件",
                                     (long)_stats.discoveredGiftKinds,
                                     (long)GiftDefinitions().count,
                                     (long)_stats.totalGifts];
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.dateFormat = @"yyyy-MM-dd";
    for (NSInteger index = 0; index < (NSInteger)GiftDefinitions().count; index++) {
        NSDictionary<NSString *, id> *gift = GiftDefinitions()[index];
        NSString *identifier = gift[@"id"];
        NSInteger count = [_stats giftCountForIdentifier:identifier];
        if (count > 0) {
            _giftImageViews[index].image = GiftImageForDefinition(gift);
            _giftPlaceholderLabels[index].hidden = YES;
            _giftNameLabels[index].stringValue = gift[@"name"];
            _giftCountLabels[index].stringValue = [NSString stringWithFormat:@"收藏 %ld 件", (long)count];
            NSDate *firstFound = [_stats firstFoundDateForIdentifier:identifier];
            _giftDateLabels[index].stringValue = [NSString stringWithFormat:@"首次发现：%@",
                                                   firstFound ? [formatter stringFromDate:firstFound] : @"—"];
            _giftNoteLabels[index].stringValue = gift[@"note"];
        } else {
            _giftImageViews[index].image = nil;
            _giftPlaceholderLabels[index].hidden = NO;
            _giftNameLabels[index].stringValue = @"尚未发现";
            _giftCountLabels[index].stringValue = @"—";
            _giftDateLabels[index].stringValue = @"首次发现：—";
            _giftNoteLabels[index].stringValue = @"多涅还没有找到它。";
        }
    }
    NSInteger seenGiftCount = [NSUserDefaults.standardUserDefaults integerForKey:@"seenGiftCount"];
    [_sectionControl setLabel:_stats.totalGifts > seenGiftCount ? @"小箱子 ✨" : @"小箱子"
                   forSegment:1];
}

- (void)show {
    [self buildWindowIfNeeded];
    [self refresh];
    [NSApp activateIgnoringOtherApps:YES];
    [_window makeKeyAndOrderFront:nil];
}

- (void)refreshIfVisible {
    if (_window.isVisible) [self refresh];
}

- (void)changeSection:(NSSegmentedControl *)sender {
    BOOL showGifts = sender.selectedSegment == 1;
    for (NSView *view in _journalSubviews) view.hidden = showGifts;
    _giftView.hidden = !showGifts;
    if (showGifts) {
        [NSUserDefaults.standardUserDefaults setInteger:_stats.totalGifts forKey:@"seenGiftCount"];
        [_sectionControl setLabel:@"小箱子" forSegment:1];
    }
}

- (void)resetStats:(id)sender {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"要重置多涅小记吗？";
    alert.informativeText = @"今天、累计记录和小箱子收藏都会清空，此操作无法撤销。";
    [alert addButtonWithTitle:@"取消"];
    [alert addButtonWithTitle:@"重置"];
    if ([alert runModal] != NSAlertSecondButtonReturn) return;
    [_stats resetAll];
    [NSUserDefaults.standardUserDefaults setInteger:0 forKey:@"seenGiftCount"];
    [self refresh];
}
@end

static NSWindow *gHelpWindow;

static void AppendHelpParagraph(NSMutableAttributedString *text,
                                NSString *content,
                                NSFont *font,
                                CGFloat paragraphSpacing,
                                BOOL bullet) {
    NSMutableParagraphStyle *style = [[NSMutableParagraphStyle alloc] init];
    style.lineSpacing = 3.0;
    style.paragraphSpacing = paragraphSpacing;
    if (bullet) {
        style.firstLineHeadIndent = 0.0;
        style.headIndent = 18.0;
    }
    NSDictionary *attributes = @{
        NSFontAttributeName: font,
        NSForegroundColorAttributeName: NSColor.labelColor,
        NSParagraphStyleAttributeName: style
    };
    [text appendAttributedString:[[NSAttributedString alloc] initWithString:content
                                                                 attributes:attributes]];
}

static NSAttributedString *HelpContent(void) {
    NSMutableAttributedString *text = [[NSMutableAttributedString alloc] init];
    AppendHelpParagraph(text, @"哈气桑多涅使用帮助\n", [NSFont boldSystemFontOfSize:24.0], 14.0, NO);
    AppendHelpParagraph(text, @"桑多涅会在桌面上待机、散步，也会留意你的鼠标。\n", [NSFont systemFontOfSize:14.0], 18.0, NO);

    AppendHelpParagraph(text, @"和她互动\n", [NSFont boldSystemFontOfSize:18.0], 8.0, NO);
    AppendHelpParagraph(text, @"•  单击她：挥爪\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  双击她：跳一下\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  拖动她：移动到喜欢的位置，放下后她会生气哈气\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  多戳她几下：她可能会不耐烦\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  在她附近快速晃动鼠标：她可能会盯住并扑过去\n", [NSFont systemFontOfSize:14.0], 10.0, YES);
    AppendHelpParagraph(text, @"扑到鼠标后，她会露出得意脸；扑空则会生气哈气。\n", [NSFont systemFontOfSize:14.0], 18.0, NO);

    AppendHelpParagraph(text, @"睡觉与唤醒\n", [NSFont boldSystemFontOfSize:18.0], 8.0, NO);
    AppendHelpParagraph(text, @"一分钟没有和她互动后，她会在当前动作结束时睡着。普通的远距离鼠标移动不会打扰她。\n", [NSFont systemFontOfSize:14.0], 8.0, NO);
    AppendHelpParagraph(text, @"•  点击或拖动她：立即醒来\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  鼠标重新靠近并短暂停留：慢慢醒来\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  菜单中的“让她睡觉 / 叫醒她”：手动切换睡眠\n", [NSFont systemFontOfSize:14.0], 10.0, YES);

    AppendHelpParagraph(text, @"调整宠物\n", [NSFont boldSystemFontOfSize:18.0], 8.0, NO);
    AppendHelpParagraph(text, @"点击菜单栏的 🐾，或者右键桑多涅，可以：\n", [NSFont systemFontOfSize:14.0], 8.0, NO);
    AppendHelpParagraph(text, @"•  手动触发得意、跳跃和哈气\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  选择默认、活泼或安静模式\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  调整宠物大小\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  设置显示、隐藏或全屏时隐藏\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  开启或关闭自动扑向鼠标\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  暂停移动、重置位置或退出应用\n", [NSFont systemFontOfSize:14.0], 12.0, YES);
    AppendHelpParagraph(text, @"开启“鼠标点击穿透”后，将无法直接点击宠物。可以从菜单栏的 🐾 再次关闭。\n", [NSFont systemFontOfSize:13.0], 0.0, NO);

    NSString *version = NSBundle.mainBundle.infoDictionary[@"CFBundleShortVersionString"] ?: @"未知";
    NSMutableParagraphStyle *versionStyle = [[NSMutableParagraphStyle alloc] init];
    versionStyle.paragraphSpacingBefore = 20.0;
    NSDictionary *versionAttributes = @{
        NSFontAttributeName: [NSFont systemFontOfSize:12.0],
        NSForegroundColorAttributeName: NSColor.secondaryLabelColor,
        NSParagraphStyleAttributeName: versionStyle
    };
    NSString *versionText = [NSString stringWithFormat:@"\n哈气桑多涅 v%@\n", version];
    [text appendAttributedString:[[NSAttributedString alloc] initWithString:versionText
                                                                 attributes:versionAttributes]];
    return text.copy;
}

static void ShowHelpWindow(void) {
    if (!gHelpWindow) {
        gHelpWindow = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 520, 540)
                                                  styleMask:NSWindowStyleMaskTitled |
                                                            NSWindowStyleMaskClosable |
                                                            NSWindowStyleMaskMiniaturizable
                                                    backing:NSBackingStoreBuffered
                                                      defer:NO];
        gHelpWindow.title = @"哈气桑多涅使用帮助";
        gHelpWindow.releasedWhenClosed = NO;
        gHelpWindow.minSize = NSMakeSize(420, 360);

        NSScrollView *scrollView = [[NSScrollView alloc] initWithFrame:gHelpWindow.contentView.bounds];
        scrollView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        scrollView.hasVerticalScroller = YES;
        scrollView.drawsBackground = NO;

        NSTextView *textView = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, 520, 760)];
        textView.editable = NO;
        textView.selectable = YES;
        textView.drawsBackground = NO;
        textView.textContainerInset = NSMakeSize(26.0, 22.0);
        textView.autoresizingMask = NSViewWidthSizable;
        textView.verticallyResizable = YES;
        textView.horizontallyResizable = NO;
        textView.textContainer.widthTracksTextView = YES;
        [textView.textStorage setAttributedString:HelpContent()];
        scrollView.documentView = textView;
        gHelpWindow.contentView = scrollView;
        [gHelpWindow center];
    }
    [NSApp activateIgnoringOtherApps:YES];
    [gHelpWindow makeKeyAndOrderFront:nil];
}

@interface SpriteAtlas : NSObject
- (instancetype)initWithBundle:(NSBundle *)bundle;
- (NSImage *)frameAtRow:(NSInteger)row column:(NSInteger)column;
- (NSImage *)proudFrameAtColumn:(NSInteger)column;
- (NSImage *)sleepFrameAtColumn:(NSInteger)column;
- (NSImage *)dragFrameAtColumn:(NSInteger)column;
@end

@implementation SpriteAtlas {
    NSImage *_source;
    NSMutableDictionary<NSString *, NSImage *> *_cache;
    NSArray<NSImage *> *_proudFrames;
    NSArray<NSImage *> *_sleepFrames;
    NSArray<NSImage *> *_dragFrames;
}

- (instancetype)initWithBundle:(NSBundle *)bundle {
    self = [super init];
    if (!self) return nil;
    NSURL *url = [bundle URLForResource:@"spritesheet" withExtension:@"png"];
    _source = url ? [[NSImage alloc] initWithContentsOfURL:url] : nil;
    if (!_source) return nil;
    _cache = [NSMutableDictionary dictionary];
    NSMutableArray<NSImage *> *proudFrames = [NSMutableArray arrayWithCapacity:6];
    for (NSInteger index = 0; index < 6; index++) {
        NSString *name = [NSString stringWithFormat:@"proud-%ld", (long)index];
        NSURL *frameURL = [bundle URLForResource:name withExtension:@"png" subdirectory:@"Proud"];
        NSImage *frame = frameURL ? [[NSImage alloc] initWithContentsOfURL:frameURL] : nil;
        if (!frame) return nil;
        [proudFrames addObject:frame];
    }
    _proudFrames = proudFrames.copy;
    NSMutableArray<NSImage *> *sleepFrames = [NSMutableArray arrayWithCapacity:6];
    for (NSInteger index = 0; index < 6; index++) {
        NSString *name = [NSString stringWithFormat:@"sleep-%ld", (long)index];
        NSURL *frameURL = [bundle URLForResource:name withExtension:@"png" subdirectory:@"Sleep"];
        NSImage *frame = frameURL ? [[NSImage alloc] initWithContentsOfURL:frameURL] : nil;
        if (!frame) return nil;
        [sleepFrames addObject:frame];
    }
    _sleepFrames = sleepFrames.copy;
    NSArray<NSString *> *dragNames = @[@"lift-1", @"lift-2", @"lift-3", @"lift-4", @"held"];
    NSMutableArray<NSImage *> *dragFrames = [NSMutableArray arrayWithCapacity:dragNames.count];
    for (NSString *name in dragNames) {
        NSURL *frameURL = [bundle URLForResource:name withExtension:@"png" subdirectory:@"Drag"];
        NSImage *frame = frameURL ? [[NSImage alloc] initWithContentsOfURL:frameURL] : nil;
        if (!frame) return nil;
        [dragFrames addObject:frame];
    }
    _dragFrames = dragFrames.copy;
    return self;
}

- (NSImage *)frameAtRow:(NSInteger)row column:(NSInteger)column {
    if (row < 0 || row >= 11 || column < 0 || column >= 8) return nil;
    NSString *key = [NSString stringWithFormat:@"%ld:%ld", (long)row, (long)column];
    NSImage *cached = _cache[key];
    if (cached) return cached;

    CGFloat sourceY = _source.size.height - ((row + 1) * kCellHeight);
    NSRect sourceRect = NSMakeRect(column * kCellWidth, sourceY, kCellWidth, kCellHeight);
    NSImage *frame = [[NSImage alloc] initWithSize:NSMakeSize(kCellWidth, kCellHeight)];
    [frame lockFocus];
    [[NSGraphicsContext currentContext] setImageInterpolation:NSImageInterpolationHigh];
    [_source drawInRect:NSMakeRect(0, 0, kCellWidth, kCellHeight)
               fromRect:sourceRect
              operation:NSCompositingOperationCopy
               fraction:1.0
         respectFlipped:NO
                  hints:nil];
    [frame unlockFocus];
    _cache[key] = frame;
    return frame;
}

- (NSImage *)proudFrameAtColumn:(NSInteger)column {
    if (column < 0 || column >= (NSInteger)_proudFrames.count) return nil;
    return _proudFrames[column];
}
- (NSImage *)sleepFrameAtColumn:(NSInteger)column {
    if (column < 0 || column >= (NSInteger)_sleepFrames.count) return nil;
    return _sleepFrames[column];
}
- (NSImage *)dragFrameAtColumn:(NSInteger)column {
    if (column < 0 || column >= (NSInteger)_dragFrames.count) return nil;
    return _dragFrames[column];
}
@end

@interface PetPanel : NSPanel @end
@implementation PetPanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

@interface SpeechBubbleView : NSView
@property(nonatomic, copy) NSString *text;
@end

@implementation SpeechBubbleView
- (BOOL)isOpaque { return NO; }
- (void)setText:(NSString *)text {
    _text = [text copy];
    self.needsDisplay = YES;
}
- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    CGFloat scale = NSWidth(self.bounds) / kSpeechBubbleWidth;
    NSRect bubbleRect = NSMakeRect(2.0 * scale, 12.0 * scale,
                                   NSWidth(self.bounds) - 4.0 * scale,
                                   NSHeight(self.bounds) - 14.0 * scale);
    NSBezierPath *tail = [NSBezierPath bezierPath];
    CGFloat centerX = NSMidX(self.bounds);
    [tail moveToPoint:NSMakePoint(centerX - 10.0 * scale, 14.0 * scale)];
    [tail lineToPoint:NSMakePoint(centerX, 2.0 * scale)];
    [tail lineToPoint:NSMakePoint(centerX + 8.0 * scale, 14.0 * scale)];
    [tail closePath];
    NSColor *fillColor = [NSColor colorWithRed:1.0 green:0.97 blue:0.94 alpha:0.98];
    NSColor *strokeColor = [NSColor colorWithRed:0.30 green:0.16 blue:0.17 alpha:1.0];
    [fillColor setFill];
    [strokeColor setStroke];
    tail.lineWidth = 2.0 * scale;
    [tail fill];
    [tail stroke];

    NSBezierPath *bubble = [NSBezierPath bezierPathWithRoundedRect:bubbleRect
                                                           xRadius:15.0 * scale
                                                           yRadius:15.0 * scale];
    bubble.lineWidth = 2.0 * scale;
    [fillColor setFill];
    [strokeColor setStroke];
    [bubble fill];
    [bubble stroke];

    NSDictionary *attributes = @{
        NSFontAttributeName: [NSFont boldSystemFontOfSize:16.0 * scale],
        NSForegroundColorAttributeName: strokeColor
    };
    NSSize textSize = [self.text sizeWithAttributes:attributes];
    NSPoint textPoint = NSMakePoint(NSMidX(bubbleRect) - textSize.width / 2.0,
                                    NSMidY(bubbleRect) - textSize.height / 2.0);
    [self.text drawAtPoint:textPoint withAttributes:attributes];
}
@end

@class PetController;

@interface GiftBubbleView : NSView
@property(nonatomic, weak) PetController *controller;
@property(nonatomic, strong) NSImage *giftImage;
@property(nonatomic) CGFloat giftScale;
@property(nonatomic) CGFloat giftOpacity;
@property(nonatomic) CGFloat giftYOffset;
@end

@interface PetView : NSView
@property(nonatomic, strong) NSImage *currentFrame;
@property(nonatomic, weak) PetController *controller;
@property(nonatomic) CGFloat visualScaleX;
@property(nonatomic) CGFloat visualScaleY;
@property(nonatomic) CGFloat visualYOffset;
@property(nonatomic) CGFloat visualRotation;
@property(nonatomic) CGFloat groundShadowOpacity;
@property(nonatomic) CGFloat groundShadowScale;
@end

@interface PetController : NSObject
@property(nonatomic, readonly) BOOL paused;
@property(nonatomic, readonly) BOOL clickThrough;
@property(nonatomic, readonly) CGFloat scale;
@property(nonatomic, readonly) BOOL cursorHuntEnabled;
@property(nonatomic, readonly) PetVisibilityMode visibilityMode;
@property(nonatomic, readonly) PetActivityLevel activityLevel;
@property(nonatomic, readonly, getter=isSleeping) BOOL sleeping;
- (instancetype)initWithAtlas:(SpriteAtlas *)atlas;
- (void)setPaused:(BOOL)paused;
- (void)setClickThrough:(BOOL)enabled;
- (void)setPetScale:(CGFloat)scale;
- (void)resetPosition;
- (void)savePosition;
- (void)saveStats;
- (void)showStats;
- (void)triggerWave;
- (void)triggerProud;
- (void)triggerJump;
- (void)triggerHiss;
- (void)triggerWaiting;
- (void)triggerWorking;
- (void)triggerReview;
- (void)toggleSleep;
- (void)triggerGiftDiscovery;
- (void)giftTapped;
- (void)setCursorHuntEnabled:(BOOL)enabled;
- (void)setVisibilityMode:(PetVisibilityMode)mode;
- (void)setActivityLevel:(PetActivityLevel)level;
- (void)petMouseDownAt:(NSPoint)location;
- (void)petMouseDraggedTo:(NSPoint)location;
- (void)petMouseUpWithClickCount:(NSInteger)clickCount;
@end

@implementation GiftBubbleView
- (BOOL)isOpaque { return NO; }
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    if (!self.giftImage || self.giftOpacity <= 0.0) return;
    [NSGraphicsContext saveGraphicsState];
    CGContextSetAlpha(NSGraphicsContext.currentContext.CGContext, self.giftOpacity);
    CGFloat unit = MIN(NSWidth(self.bounds), NSHeight(self.bounds)) / 70.0;
    NSPoint center = NSMakePoint(NSMidX(self.bounds), NSMidY(self.bounds) - self.giftYOffset * unit);
    CGFloat diameter = 48.0 * unit * MAX(0.1, self.giftScale);
    NSRect circleRect = NSMakeRect(center.x - diameter / 2.0, center.y - diameter / 2.0,
                                   diameter, diameter);
    [[NSColor.systemYellowColor colorWithAlphaComponent:0.28] setFill];
    [[NSBezierPath bezierPathWithOvalInRect:NSInsetRect(circleRect, -8.0 * unit, -8.0 * unit)] fill];
    NSBezierPath *pedestal = [NSBezierPath bezierPathWithOvalInRect:circleRect];
    [[NSColor colorWithRed:1.0 green:0.96 blue:0.84 alpha:0.96] setFill];
    [[NSColor colorWithRed:0.39 green:0.22 blue:0.16 alpha:0.92] setStroke];
    pedestal.lineWidth = 2.0 * unit;
    [pedestal fill];
    [pedestal stroke];
    CGFloat iconSide = 42.0 * unit * MAX(0.1, self.giftScale);
    NSRect iconRect = NSMakeRect(center.x - iconSide / 2.0, center.y - iconSide / 2.0,
                                 iconSide, iconSide);
    [self.giftImage drawInRect:iconRect
                      fromRect:NSZeroRect
                     operation:NSCompositingOperationSourceOver
                      fraction:1.0
                respectFlipped:YES
                         hints:@{NSImageHintInterpolation: @(NSImageInterpolationHigh)}];
    [@"✨" drawAtPoint:NSMakePoint(center.x + diameter * 0.26,
                                   center.y + diameter * 0.30)
          withAttributes:@{NSFontAttributeName: [NSFont systemFontOfSize:11.0 * unit]}];
    [NSGraphicsContext restoreGraphicsState];
}
- (void)mouseDown:(NSEvent *)event { [self.controller giftTapped]; }
@end

@implementation PetView

- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (void)setCurrentFrame:(NSImage *)currentFrame {
    _currentFrame = currentFrame;
    self.needsDisplay = YES;
}
- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    if (!_currentFrame) return;
    if (self.groundShadowOpacity > 0.0) {
        CGFloat unitX = NSWidth(self.bounds) / kCellWidth;
        CGFloat unitY = NSHeight(self.bounds) / kCellHeight;
        CGFloat shadowScale = self.groundShadowScale > 0.0 ? self.groundShadowScale : 1.0;
        CGFloat shadowWidth = 100.0 * unitX * shadowScale;
        CGFloat shadowHeight = 13.0 * unitY * shadowScale;
        NSRect shadowRect = NSMakeRect(NSMidX(self.bounds) - shadowWidth / 2.0,
                                       NSHeight(self.bounds) - 17.0 * unitY - shadowHeight / 2.0,
                                       shadowWidth, shadowHeight);
        [[NSColor colorWithWhite:0.18 alpha:self.groundShadowOpacity] setFill];
        [[NSBezierPath bezierPathWithOvalInRect:shadowRect] fill];
    }
    CGFloat scaleX = self.visualScaleX > 0.0 ? self.visualScaleX : 1.0;
    CGFloat scaleY = self.visualScaleY > 0.0 ? self.visualScaleY : 1.0;
    [NSGraphicsContext saveGraphicsState];
    NSAffineTransform *transform = [NSAffineTransform transform];
    [transform translateXBy:NSMidX(self.bounds) yBy:NSMidY(self.bounds) + self.visualYOffset];
    [transform rotateByRadians:self.visualRotation];
    [transform scaleXBy:scaleX yBy:scaleY];
    [transform translateXBy:-NSMidX(self.bounds) yBy:-NSMidY(self.bounds)];
    [transform concat];
    [_currentFrame drawInRect:self.bounds
                     fromRect:NSZeroRect
                    operation:NSCompositingOperationSourceOver
                     fraction:1.0
               respectFlipped:YES
                        hints:@{NSImageHintInterpolation: @(NSImageInterpolationHigh)}];
    [NSGraphicsContext restoreGraphicsState];
}
- (void)mouseDown:(NSEvent *)event {
    [self.controller petMouseDownAt:NSEvent.mouseLocation];
}
- (void)mouseDragged:(NSEvent *)event {
    [self.controller petMouseDraggedTo:NSEvent.mouseLocation];
}
- (void)mouseUp:(NSEvent *)event {
    [self.controller petMouseUpWithClickCount:event.clickCount];
}
- (void)rightMouseDown:(NSEvent *)event {
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"哈气桑多涅"];
    NSMenuItem *proud = [[NSMenuItem alloc] initWithTitle:@"得意一下" action:@selector(contextProud:) keyEquivalent:@""];
    proud.target = self;
    [menu addItem:proud];
    NSMenuItem *hiss = [[NSMenuItem alloc] initWithTitle:@"哈气！" action:@selector(contextHiss:) keyEquivalent:@""];
    hiss.target = self;
    [menu addItem:hiss];
    NSMenuItem *gift = [[NSMenuItem alloc] initWithTitle:@"让她找找看" action:@selector(contextGift:) keyEquivalent:@""];
    gift.target = self;
    [menu addItem:gift];
    NSMenuItem *sleep = [[NSMenuItem alloc] initWithTitle:self.controller.isSleeping ? @"叫醒她" : @"让她睡觉"
                                                  action:@selector(contextToggleSleep:)
                                           keyEquivalent:@""];
    sleep.target = self;
    [menu addItem:sleep];
    NSMenuItem *reset = [[NSMenuItem alloc] initWithTitle:@"回到屏幕右下角" action:@selector(contextReset:) keyEquivalent:@""];
    reset.target = self;
    [menu addItem:reset];
    NSMenu *visibilityMenu = [[NSMenu alloc] initWithTitle:@"宠物显示"];
    NSArray *visibilityOptions = @[
        @[@"始终显示", @(PetVisibilityModeAlwaysShow)],
        @[@"隐藏宠物", @(PetVisibilityModeAlwaysHide)],
        @[@"进入全屏后隐藏", @(PetVisibilityModeHideInFullscreen)]
    ];
    for (NSArray *option in visibilityOptions) {
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:option[0]
                                                     action:@selector(contextChangeVisibility:)
                                              keyEquivalent:@""];
        item.target = self;
        item.representedObject = option[1];
        item.state = [option[1] integerValue] == self.controller.visibilityMode
            ? NSControlStateValueOn : NSControlStateValueOff;
        [visibilityMenu addItem:item];
    }
    NSMenuItem *visibilityRoot = [[NSMenuItem alloc] initWithTitle:@"宠物显示" action:nil keyEquivalent:@""];
    visibilityRoot.submenu = visibilityMenu;
    [menu addItem:visibilityRoot];
    NSMenu *activityMenu = [[NSMenu alloc] initWithTitle:@"活动性"];
    NSArray *activityOptions = @[
        @[@"默认", @(PetActivityLevelDefault)],
        @[@"活泼", @(PetActivityLevelLively)],
        @[@"安静（不主动活动）", @(PetActivityLevelQuiet)]
    ];
    for (NSArray *option in activityOptions) {
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:option[0]
                                                     action:@selector(contextChangeActivity:)
                                              keyEquivalent:@""];
        item.target = self;
        item.representedObject = option[1];
        item.state = [option[1] integerValue] == self.controller.activityLevel
            ? NSControlStateValueOn : NSControlStateValueOff;
        [activityMenu addItem:item];
    }
    NSMenuItem *activityRoot = [[NSMenuItem alloc] initWithTitle:@"活动性" action:nil keyEquivalent:@""];
    activityRoot.submenu = activityMenu;
    [menu addItem:activityRoot];
    NSMenuItem *stats = [[NSMenuItem alloc] initWithTitle:@"多涅小记…" action:@selector(contextStats:) keyEquivalent:@""];
    stats.target = self;
    [menu addItem:stats];
    NSMenuItem *help = [[NSMenuItem alloc] initWithTitle:@"使用帮助…" action:@selector(contextHelp:) keyEquivalent:@""];
    help.target = self;
    [menu addItem:help];
    [menu addItem:NSMenuItem.separatorItem];
    NSMenuItem *quit = [[NSMenuItem alloc] initWithTitle:@"退出哈气桑多涅" action:@selector(contextQuit:) keyEquivalent:@""];
    quit.target = self;
    [menu addItem:quit];
    [NSMenu popUpContextMenu:menu withEvent:event forView:self];
}
- (void)contextProud:(id)sender { [self.controller triggerProud]; }
- (void)contextHiss:(id)sender { [self.controller triggerHiss]; }
- (void)contextGift:(id)sender { [self.controller triggerGiftDiscovery]; }
- (void)contextToggleSleep:(id)sender { [self.controller toggleSleep]; }
- (void)contextReset:(id)sender { [self.controller resetPosition]; }
- (void)contextChangeVisibility:(NSMenuItem *)sender {
    [self.controller setVisibilityMode:(PetVisibilityMode)[sender.representedObject integerValue]];
}
- (void)contextChangeActivity:(NSMenuItem *)sender {
    [self.controller setActivityLevel:(PetActivityLevel)[sender.representedObject integerValue]];
}
- (void)contextStats:(id)sender { [self.controller showStats]; }
- (void)contextHelp:(id)sender { ShowHelpWindow(); }
- (void)contextQuit:(id)sender { [NSApp terminate:nil]; }
@end

@implementation PetController {
    SpriteAtlas *_atlas;
    PetPanel *_panel;
    PetView *_view;
    NSPanel *_speechPanel;
    SpeechBubbleView *_speechView;
    NSPanel *_giftPanel;
    GiftBubbleView *_giftBubbleView;
    NSTimer *_speechTimer;
    NSTimer *_timer;
    PetMode _mode;
    NSInteger _frameIndex;
    NSInteger _frameClock;
    NSInteger _phaseTicks;
    NSInteger _transientLoopsRemaining;
    NSInteger _idleLookClock;
    NSPoint _dragOffset;
    BOOL _dragging;
    BOOL _pointerHeld;
    NSPoint _latestPointer;
    NSTimeInterval _pressStartedAt;
    NSInteger _dragVisualTick;
    BOOL _dropping;
    NSInteger _dropTick;
    CGFloat _jumpBaseY;
    CGFloat _jumpHeight;
    NSInteger _jumpTick;
    NSInteger _jumpTotalTicks;
    CGFloat _hissBaseX;
    NSInteger _hissTick;
    BOOL _hasLastPointer;
    NSPoint _lastPointer;
    NSPoint _lastPointerDelta;
    CGFloat _lureScore;
    NSInteger _huntCooldownTicks;
    NSInteger _huntAnticipationTicks;
    NSPoint _huntTarget;
    BOOL _pounceActive;
    CGFloat _pounceStartX;
    CGFloat _pounceTargetX;
    NSTimeInterval _lastPokeTime;
    NSInteger _pokeCount;
    BOOL _petIsVisible;
    BOOL _lastFullscreenDetected;
    NSInteger _fullscreenCheckClock;
    NSTimeInterval _lastInteractionTime;
    BOOL _sleepRequested;
    BOOL _sleeping;
    BOOL _wakeProximityArmed;
    NSInteger _wakeHoverTicks;
    PetStats *_stats;
    StatsWindowController *_statsWindowController;
    NSTimeInterval _lastStatsTickTime;
    BOOL _giftActive;
    NSInteger _giftTick;
    NSInteger _giftReactionTicks;
    NSInteger _giftCooldownTicks;
    NSDictionary<NSString *, id> *_currentGift;
}

- (instancetype)initWithAtlas:(SpriteAtlas *)atlas {
    self = [super init];
    if (!self) return nil;
    _atlas = atlas;
    _stats = [[PetStats alloc] init];
    _statsWindowController = [[StatsWindowController alloc] initWithStats:_stats];
    _lastStatsTickTime = NSDate.timeIntervalSinceReferenceDate;
    _giftCooldownTicks = 24 * 8;
    double savedScale = [NSUserDefaults.standardUserDefaults doubleForKey:@"petScale"];
    _scale = savedScale == 0 ? kStandardPetScale
                             : MAX(kMinimumPetScale, MIN(kMaximumPetScale, savedScale));
    id savedHuntSetting = [NSUserDefaults.standardUserDefaults objectForKey:@"cursorHuntEnabled"];
    _cursorHuntEnabled = savedHuntSetting ? [savedHuntSetting boolValue] : YES;
    NSInteger savedVisibility = [NSUserDefaults.standardUserDefaults integerForKey:@"visibilityMode"];
    _visibilityMode = savedVisibility >= PetVisibilityModeAlwaysShow &&
                      savedVisibility <= PetVisibilityModeHideInFullscreen
        ? (PetVisibilityMode)savedVisibility : PetVisibilityModeAlwaysShow;
    NSInteger savedActivity = [NSUserDefaults.standardUserDefaults integerForKey:@"activityLevel"];
    _activityLevel = savedActivity >= PetActivityLevelDefault && savedActivity <= PetActivityLevelQuiet
        ? (PetActivityLevel)savedActivity : PetActivityLevelDefault;
    NSSize size = NSMakeSize(kCellWidth * _scale, kCellHeight * _scale);

    _panel = [[PetPanel alloc] initWithContentRect:NSMakeRect(0, 0, size.width, size.height)
                                         styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                                           backing:NSBackingStoreBuffered
                                             defer:NO];
    _view = [[PetView alloc] initWithFrame:NSMakeRect(0, 0, size.width, size.height)];
    _view.controller = self;
    _view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _panel.contentView = _view;
    _panel.backgroundColor = NSColor.clearColor;
    _panel.opaque = NO;
    _panel.hasShadow = NO;
    _panel.level = NSFloatingWindowLevel;
    _panel.hidesOnDeactivate = NO;
    _panel.releasedWhenClosed = NO;
    _panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                                NSWindowCollectionBehaviorFullScreenAuxiliary |
                                NSWindowCollectionBehaviorStationary |
                                NSWindowCollectionBehaviorIgnoresCycle;

    CGFloat speechScale = _scale / kStandardPetScale;
    NSSize speechSize = NSMakeSize(kSpeechBubbleWidth * speechScale,
                                   kSpeechBubbleHeight * speechScale);
    _speechPanel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, speechSize.width, speechSize.height)
                                              styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    _speechView = [[SpeechBubbleView alloc] initWithFrame:NSMakeRect(0, 0, speechSize.width, speechSize.height)];
    _speechPanel.contentView = _speechView;
    _speechPanel.backgroundColor = NSColor.clearColor;
    _speechPanel.opaque = NO;
    _speechPanel.hasShadow = NO;
    _speechPanel.ignoresMouseEvents = YES;
    _speechPanel.level = _panel.level + 1;
    _speechPanel.hidesOnDeactivate = NO;
    _speechPanel.releasedWhenClosed = NO;
    _speechPanel.collectionBehavior = _panel.collectionBehavior;
    [_panel addChildWindow:_speechPanel ordered:NSWindowAbove];
    [_speechPanel orderOut:nil];

    CGFloat giftPanelScale = _scale / kStandardPetScale;
    NSSize giftPanelSize = NSMakeSize(70.0 * giftPanelScale, 70.0 * giftPanelScale);
    _giftPanel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, giftPanelSize.width, giftPanelSize.height)
                                            styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                                              backing:NSBackingStoreBuffered
                                                defer:NO];
    _giftBubbleView = [[GiftBubbleView alloc] initWithFrame:NSMakeRect(0, 0, giftPanelSize.width, giftPanelSize.height)];
    _giftBubbleView.controller = self;
    _giftBubbleView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _giftPanel.contentView = _giftBubbleView;
    _giftPanel.backgroundColor = NSColor.clearColor;
    _giftPanel.opaque = NO;
    _giftPanel.hasShadow = NO;
    _giftPanel.level = _panel.level + 1;
    _giftPanel.hidesOnDeactivate = NO;
    _giftPanel.releasedWhenClosed = NO;
    _giftPanel.collectionBehavior = _panel.collectionBehavior;
    [_panel addChildWindow:_giftPanel ordered:NSWindowAbove];
    [_giftPanel orderOut:nil];

    if (![self restorePosition]) [self positionAtBottomRight];
    [self setMode:PetModeIdle ticks:80 loops:0];
    _lastInteractionTime = NSDate.timeIntervalSinceReferenceDate;
    _petIsVisible = NO;
    [self refreshVisibility];
    _timer = [NSTimer timerWithTimeInterval:1.0 / 24.0
                                     target:self
                                   selector:@selector(tick:)
                                   userInfo:nil
                                    repeats:YES];
    [NSRunLoop.mainRunLoop addTimer:_timer forMode:NSRunLoopCommonModes];
    return self;
}

- (void)dealloc {
    [_timer invalidate];
    [_speechTimer invalidate];
}

- (void)setPaused:(BOOL)paused {
    _paused = paused;
    if (paused) {
        [self cancelGiftPresentation];
        [self cancelHunt];
        [self setMode:PetModeIdle ticks:NSIntegerMax loops:0];
    }
    else [self chooseNextRoamPhase];
}

- (void)setClickThrough:(BOOL)enabled {
    _clickThrough = enabled;
    _panel.ignoresMouseEvents = enabled;
}

- (void)setPetScale:(CGFloat)newScale {
    CGFloat clamped = MAX(kMinimumPetScale, MIN(kMaximumPetScale, newScale));
    NSRect oldFrame = _panel.frame;
    _scale = clamped;
    [NSUserDefaults.standardUserDefaults setDouble:clamped forKey:@"petScale"];
    NSSize size = NSMakeSize(kCellWidth * clamped, kCellHeight * clamped);
    NSPoint origin = NSMakePoint(NSMidX(oldFrame) - size.width / 2.0, NSMinY(oldFrame));
    [_panel setFrame:NSMakeRect(origin.x, origin.y, size.width, size.height) display:YES];
    CGFloat speechScale = clamped / kStandardPetScale;
    [_speechPanel setContentSize:NSMakeSize(kSpeechBubbleWidth * speechScale,
                                            kSpeechBubbleHeight * speechScale)];
    CGFloat giftPanelScale = clamped / kStandardPetScale;
    [_giftPanel setContentSize:NSMakeSize(70.0 * giftPanelScale, 70.0 * giftPanelScale)];
    _speechView.needsDisplay = YES;
    [self clampToCurrentScreen];
    [self positionSpeechBubble];
    [self positionGiftPanel];
    [self savePosition];
}

- (void)resetPosition {
    [self noteInteraction];
    [self positionAtBottomRight];
    [self savePosition];
    [self refreshVisibility];
}

- (void)setVisibilityMode:(PetVisibilityMode)mode {
    if (mode < PetVisibilityModeAlwaysShow || mode > PetVisibilityModeHideInFullscreen) return;
    _visibilityMode = mode;
    [NSUserDefaults.standardUserDefaults setInteger:mode forKey:@"visibilityMode"];
    _fullscreenCheckClock = 0;
    [self refreshVisibility];
}

- (void)setActivityLevel:(PetActivityLevel)level {
    if (level < PetActivityLevelDefault || level > PetActivityLevelQuiet) return;
    _activityLevel = level;
    [NSUserDefaults.standardUserDefaults setInteger:level forKey:@"activityLevel"];
    if (level == PetActivityLevelQuiet &&
        (_mode == PetModeWalkLeft || _mode == PetModeWalkRight || _mode == PetModeIdle)) {
        [self setMode:PetModeIdle ticks:NSIntegerMax loops:0];
    } else if (_mode == PetModeIdle) {
        [self chooseNextRoamPhase];
    }
}

- (void)triggerWave {
    [self noteInteraction];
    [self cancelGiftPresentation];
    [self startWave];
}
- (void)startWave {
    [self cancelHunt];
    [self setMode:PetModeWaving ticks:90 loops:2];
}
- (void)triggerProud {
    [self noteInteraction];
    [self cancelGiftPresentation];
    [self startProud];
}
- (void)startProud {
    [self cancelHunt];
    [self setMode:PetModeProud ticks:90 loops:2];
    [self showSpeechText:@"多涅多涅~" duration:1.8];
}
- (void)triggerJump {
    [self noteInteraction];
    [self cancelGiftPresentation];
    [self startJump];
}
- (void)startJump {
    [self cancelHunt];
    if (_mode == PetModeJumping) {
        NSPoint origin = _panel.frame.origin;
        origin.y = _jumpBaseY;
        [_panel setFrameOrigin:origin];
    }
    _jumpBaseY = _panel.frame.origin.y;
    _jumpTick = 0;
    _jumpTotalTicks = 34;
    CGFloat scaledHeight = _panel.frame.size.height * 0.5;
    NSScreen *screen = [self screenForPanel];
    CGFloat availableHeight = screen ? NSMaxY(screen.visibleFrame) - NSMaxY(_panel.frame) - 8.0 : scaledHeight;
    _jumpHeight = MAX(0.0, MIN(scaledHeight, availableHeight));
    [self setMode:PetModeJumping ticks:90 loops:0];
}
- (void)triggerHiss {
    [self noteInteraction];
    [self cancelGiftPresentation];
    [self startHissWithLoops:2];
}
- (void)startHissWithLoops:(NSInteger)loops {
    [_stats recordHiss];
    [self cancelHunt];
    if (_mode == PetModeHissing) {
        NSPoint origin = _panel.frame.origin;
        origin.x = _hissBaseX;
        [_panel setFrameOrigin:origin];
    }
    _hissBaseX = _panel.frame.origin.x;
    _hissTick = 0;
    [self setMode:PetModeHissing ticks:90 loops:loops];
    [self showSpeechText:@"哈?~~" duration:MAX(2.0, (NSTimeInterval)loops)];
}
- (void)triggerWaiting { [self noteInteraction]; [self cancelGiftPresentation]; [self setMode:PetModeWaiting ticks:90 loops:2]; }
- (void)triggerWorking { [self noteInteraction]; [self cancelGiftPresentation]; [self setMode:PetModeWorking ticks:90 loops:2]; }
- (void)triggerReview { [self noteInteraction]; [self cancelGiftPresentation]; [self setMode:PetModeReview ticks:90 loops:2]; }

- (void)triggerGiftDiscovery {
    [self noteInteraction];
    [self startGiftDiscovery:RandomGiftDefinition()];
}

- (void)startGiftDiscovery:(NSDictionary<NSString *, id> *)gift {
    if (!gift || _dragging || _dropping) return;
    [self cancelHunt];
    if (_sleeping) [self wakeFromSleep];
    [self cancelGiftPresentation];
    [self setMode:PetModeReview ticks:NSIntegerMax loops:0];
    _currentGift = gift;
    _giftActive = YES;
    _giftTick = 0;
    _giftReactionTicks = 0;
    _giftCooldownTicks = 24 * 240;
    _giftBubbleView.giftImage = GiftImageForDefinition(gift);
    _giftBubbleView.giftScale = 0.35;
    _giftBubbleView.giftOpacity = 0.0;
    _giftBubbleView.giftYOffset = 12.0;
    [self positionGiftPanel];
    if (_petIsVisible) [_giftPanel orderFront:nil];
    [_stats recordGiftWithIdentifier:gift[@"id"]];
    [_statsWindowController refreshIfVisible];
    [self showSpeechText:@"多涅？" duration:1.1];
}

- (void)giftTapped {
    if (!_giftActive) return;
    [self noteInteraction];
    [_stats recordInteraction];
    _giftReactionTicks = 32;
    [self showSpeechText:@"多涅！💢" duration:1.7];
}

- (void)cancelGiftPresentation {
    _giftActive = NO;
    _giftTick = 0;
    _giftReactionTicks = 0;
    _currentGift = nil;
    _giftBubbleView.giftImage = nil;
    _giftBubbleView.giftOpacity = 0.0;
    _giftBubbleView.giftScale = 1.0;
    _giftBubbleView.giftYOffset = 0.0;
    _giftBubbleView.needsDisplay = YES;
    [_giftPanel orderOut:nil];
}

- (void)tickGift {
    const NSInteger popTicks = 14;
    const NSInteger proudStartTick = 27;
    const NSInteger fadeStartTick = 126;
    const NSInteger totalTicks = 144;
    _giftTick += 1;

    if (_giftTick <= popTicks) {
        CGFloat t = (CGFloat)_giftTick / (CGFloat)popTicks;
        CGFloat eased = 1.0 - pow(1.0 - t, 3.0);
        _giftBubbleView.giftScale = 0.35 + 0.65 * eased + sin(t * M_PI) * 0.16;
        _giftBubbleView.giftOpacity = eased;
        _giftBubbleView.giftYOffset = 12.0 * (1.0 - eased);
    } else if (_giftTick >= fadeStartTick) {
        CGFloat t = (CGFloat)(_giftTick - fadeStartTick) / (CGFloat)(totalTicks - fadeStartTick);
        _giftBubbleView.giftScale = 1.0 - 0.28 * t;
        _giftBubbleView.giftOpacity = MAX(0.0, 1.0 - t);
        _giftBubbleView.giftYOffset = -10.0 * t;
    } else {
        _giftBubbleView.giftScale = 1.0 + sin((CGFloat)_giftTick * 0.18) * 0.035;
        _giftBubbleView.giftOpacity = 1.0;
        _giftBubbleView.giftYOffset = sin((CGFloat)_giftTick * 0.12) * 1.2;
    }
    _giftBubbleView.needsDisplay = YES;
    [self positionGiftPanel];

    if (_giftReactionTicks > 0) {
        _giftReactionTicks -= 1;
        [self showRow:RowForMode(PetModeHissing) column:(_giftTick / 3) % 8];
    } else if (_giftTick < proudStartTick) {
        [self showRow:RowForMode(PetModeReview) column:(_giftTick / 5) % 6];
    } else {
        _view.currentFrame = [_atlas proudFrameAtColumn:(_giftTick / 5) % 6];
        if (_giftTick == proudStartTick) [self showSpeechText:@"多涅。🎁" duration:2.0];
    }

    if (_giftTick < totalTicks) return;
    [self cancelGiftPresentation];
    [self startTimedIdle];
}

- (BOOL)isSleeping { return _sleeping; }

- (void)noteInteraction {
    _lastInteractionTime = NSDate.timeIntervalSinceReferenceDate;
    _sleepRequested = NO;
    if (_sleeping) [self wakeFromSleep];
}

- (void)toggleSleep {
    if (_sleeping) {
        [self noteInteraction];
        return;
    }
    _lastInteractionTime = NSDate.timeIntervalSinceReferenceDate;
    _sleepRequested = YES;
    if (_mode == PetModeIdle || _mode == PetModeWalkLeft || _mode == PetModeWalkRight) {
        [self startSleeping];
    }
}

- (CGFloat)sleepWakeRadius {
    return _panel.frame.size.width * 1.18;
}

- (void)startSleeping {
    [_stats recordSleep];
    [self cancelHunt];
    _sleepRequested = NO;
    _sleeping = YES;
    _wakeHoverTicks = 0;
    NSPoint center = NSMakePoint(NSMidX(_panel.frame), NSMidY(_panel.frame));
    NSPoint pointer = NSEvent.mouseLocation;
    _wakeProximityArmed = hypot(pointer.x - center.x, pointer.y - center.y) > [self sleepWakeRadius];
    [self setMode:PetModeSleeping ticks:NSIntegerMax loops:0];
    [self showSpeechText:@"Zzz…" duration:2.2];
}

- (void)wakeFromSleep {
    if (!_sleeping) return;
    _sleeping = NO;
    _sleepRequested = NO;
    _wakeHoverTicks = 0;
    [_speechTimer invalidate];
    _speechTimer = nil;
    [_speechPanel orderOut:nil];
    [self setMode:PetModeIdle ticks:48 loops:0];
}

- (void)updateAutomaticSleep {
    if (_sleeping || _sleepRequested) return;
    NSTimeInterval now = NSDate.timeIntervalSinceReferenceDate;
    if (now - _lastInteractionTime < kAutomaticSleepDelay) return;
    _sleepRequested = YES;
    if (_mode == PetModeIdle) [self startSleeping];
}

- (void)tickSleeping {
    _frameClock += 1;
    if (_frameClock >= 10) {
        _frameClock = 0;
        _frameIndex = (_frameIndex + 1) % FrameCountForMode(PetModeSleeping);
    }
    _view.currentFrame = [_atlas sleepFrameAtColumn:_frameIndex];

    NSPoint center = NSMakePoint(NSMidX(_panel.frame), NSMidY(_panel.frame));
    NSPoint pointer = NSEvent.mouseLocation;
    CGFloat distance = hypot(pointer.x - center.x, pointer.y - center.y);
    CGFloat radius = [self sleepWakeRadius];
    if (!_wakeProximityArmed) {
        if (distance > radius) _wakeProximityArmed = YES;
        return;
    }
    if (distance <= radius) {
        _wakeHoverTicks += 1;
        if (_wakeHoverTicks >= 20) {
            _lastInteractionTime = NSDate.timeIntervalSinceReferenceDate;
            [self wakeFromSleep];
        }
    } else {
        _wakeHoverTicks = 0;
    }
}

- (void)setCursorHuntEnabled:(BOOL)enabled {
    _cursorHuntEnabled = enabled;
    [NSUserDefaults.standardUserDefaults setBool:enabled forKey:@"cursorHuntEnabled"];
    if (!enabled) {
        _lureScore = 0;
        _huntAnticipationTicks = 0;
        _pounceActive = NO;
        if (_mode == PetModeJumping) [self chooseNextRoamPhase];
    }
}

- (void)cancelHunt {
    _huntAnticipationTicks = 0;
    _pounceActive = NO;
    _lureScore = 0.0;
}

- (void)petMouseDownAt:(NSPoint)location {
    if (_giftActive) [self cancelGiftPresentation];
    [self noteInteraction];
    if (_huntAnticipationTicks > 0 || _pounceActive) {
        [self cancelHunt];
        [self setMode:PetModeIdle ticks:80 loops:0];
    }
    _pointerHeld = YES;
    _pressStartedAt = NSDate.timeIntervalSinceReferenceDate;
    _latestPointer = location;
    _dragOffset = NSMakePoint(location.x - _panel.frame.origin.x,
                              location.y - _panel.frame.origin.y);
}
- (void)petMouseDraggedTo:(NSPoint)location {
    [self noteInteraction];
    _latestPointer = location;
    if (_dragging) {
        [_panel setFrameOrigin:NSMakePoint(location.x - _dragOffset.x,
                                           location.y - _dragOffset.y)];
    }
}
- (void)petMouseUpWithClickCount:(NSInteger)clickCount {
    _pointerHeld = NO;
    BOOL wasDragging = _dragging;
    _dragging = NO;
    [self clampToCurrentScreen];
    [_stats recordInteraction];
    if (wasDragging) {
        _pokeCount = 0;
        [self savePosition];
        _dropping = YES;
        _dropTick = 0;
        [self updateDragVisualForPhase:0.0 dropping:YES];
        return;
    }
    _dropping = NO;
    if (clickCount >= 2) {
        _pokeCount = 0;
        [self triggerJump];
    } else if (clickCount == 1) {
        NSTimeInterval now = NSDate.timeIntervalSinceReferenceDate;
        _pokeCount = (now - _lastPokeTime < 1.35) ? _pokeCount + 1 : 1;
        _lastPokeTime = now;
        if (_pokeCount >= 3) {
            _pokeCount = 0;
            [self triggerHiss];
        } else {
            [self triggerWave];
        }
    }
}

- (void)beginLongPressDrag {
    if (!_pointerHeld || _dragging) return;
    [self cancelHunt];
    [self setMode:PetModeIdle ticks:80 loops:0];
    _dropping = NO;
    _dragging = YES;
    _dragVisualTick = 0;
    [_speechTimer invalidate];
    _speechTimer = nil;
    [_speechPanel orderOut:nil];
    _view.currentFrame = [_atlas dragFrameAtColumn:0];
    [_panel setFrameOrigin:NSMakePoint(_latestPointer.x - _dragOffset.x,
                                       _latestPointer.y - _dragOffset.y)];
    [self updateDragVisualForPhase:0.0 dropping:NO];
}

- (void)updateDragVisualForPhase:(CGFloat)progress dropping:(BOOL)dropping {
    CGFloat clamped = MAX(0.0, MIN(1.0, progress));
    CGFloat eased = 1.0 - pow(1.0 - clamped, 3.0);
    CGFloat lift = dropping ? 1.0 - eased : eased;
    CGFloat squash = dropping ? sin(clamped * M_PI) : 0.0;
    NSInteger step = MIN(4, (NSInteger)floor(clamped * 5.0));
    _view.currentFrame = [_atlas dragFrameAtColumn:dropping ? 4 - step : step];
    CGFloat baseScale = 1.0 - 0.14 * lift;
    _view.visualYOffset = (2.0 - 30.0 * lift) * _scale;
    _view.visualScaleX = baseScale + squash * 0.04;
    _view.visualScaleY = baseScale - squash * 0.055;
    _view.visualRotation = 0.0;
    _view.groundShadowOpacity = 0.26 * lift;
    _view.groundShadowScale = 1.0 - 0.28 * lift;
    _view.needsDisplay = YES;
}

- (void)tickDrag {
    _dragVisualTick += 1;
    CGFloat progress = MIN(1.0, (CGFloat)_dragVisualTick / (CGFloat)kDragLiftTicks);
    [self updateDragVisualForPhase:progress dropping:NO];
    if (progress >= 1.0) {
        CGFloat sway = sin((CGFloat)(_dragVisualTick - kDragLiftTicks) * 0.22);
        _view.visualYOffset = -28.0 * _scale + sway * 1.5 * _scale;
        _view.visualRotation = sway * 0.018;
        _view.needsDisplay = YES;
    }
}

- (void)tickDrop {
    _dropTick += 1;
    CGFloat progress = MIN(1.0, (CGFloat)_dropTick / (CGFloat)kDragDropTicks);
    [self updateDragVisualForPhase:progress dropping:YES];
    if (progress < 1.0) return;
    _dropping = NO;
    _view.visualScaleX = 1.0;
    _view.visualScaleY = 1.0;
    _view.visualYOffset = 0.0;
    _view.visualRotation = 0.0;
    _view.groundShadowOpacity = 0.0;
    _view.groundShadowScale = 1.0;
    [self startHissWithLoops:2];
}

- (void)tick:(NSTimer *)timer {
    _fullscreenCheckClock += 1;
    if (_fullscreenCheckClock >= 12) {
        _fullscreenCheckClock = 0;
        [self refreshVisibility];
    }
    NSTimeInterval now = NSDate.timeIntervalSinceReferenceDate;
    NSTimeInterval elapsed = now - _lastStatsTickTime;
    _lastStatsTickTime = now;
    if (_petIsVisible) [_stats addVisibleSeconds:elapsed];
    if (!_petIsVisible) return;
    if (_pointerHeld && !_dragging &&
        now - _pressStartedAt >= kDragLongPressDelay) [self beginLongPressDrag];
    if (_dragging) {
        [self tickDrag];
        return;
    }
    if (_dropping) {
        [self tickDrop];
        return;
    }
    if (_giftCooldownTicks > 0) _giftCooldownTicks -= 1;
    if (_huntCooldownTicks > 0) _huntCooldownTicks -= 1;
    [self updateAutomaticSleep];
    if (_sleeping) {
        [self tickSleeping];
        return;
    }
    if (!_giftActive && _giftCooldownTicks <= 0 && !_paused &&
        _activityLevel != PetActivityLevelQuiet && _mode == PetModeIdle &&
        arc4random_uniform(360) == 0) {
        [self startGiftDiscovery:RandomGiftDefinition()];
    }
    if (_giftActive) {
        [self tickGift];
        return;
    }
    [self updateMouseHunt];
    if (_huntAnticipationTicks > 0) {
        [self tickHuntAnticipation];
        return;
    }
    if (_mode == PetModeWalkRight || _mode == PetModeWalkLeft) [self moveHorizontally];
    if (_mode == PetModeJumping) {
        [self tickJump];
        return;
    } else if (_mode == PetModeHissing) {
        _hissTick += 1;
        NSPoint origin = _panel.frame.origin;
        origin.x = _hissBaseX + sin((CGFloat)_hissTick * 1.7) * 4.5 * _scale;
        [_panel setFrameOrigin:origin];
    }

    _frameClock += 1;
    if (_frameClock >= 3) {
        _frameClock = 0;
        _frameIndex += 1;
        if (_frameIndex >= FrameCountForMode(_mode)) {
            _frameIndex = 0;
            if (IsTransientMode(_mode)) {
                _transientLoopsRemaining -= 1;
                if (_transientLoopsRemaining <= 0) {
                    [self chooseNextRoamPhase];
                    return;
                }
            }
        }
    }

    if (_mode == PetModeIdle) {
        _idleLookClock += 1;
        [self renderIdleOrLook];
    } else if (_mode == PetModeProud) {
        _view.currentFrame = [_atlas proudFrameAtColumn:_frameIndex];
    } else {
        [self showRow:RowForMode(_mode) column:_frameIndex];
    }

    if (!_paused && !IsTransientMode(_mode)) {
        _phaseTicks -= 1;
        if (_phaseTicks <= 0) [self chooseNextRoamPhase];
    }
}

- (void)refreshVisibility {
    BOOL shouldShow = YES;
    if (_visibilityMode == PetVisibilityModeAlwaysHide) {
        shouldShow = NO;
    } else if (_visibilityMode == PetVisibilityModeHideInFullscreen) {
        _lastFullscreenDetected = [self isFrontmostApplicationFullscreen];
        shouldShow = !_lastFullscreenDetected;
    }
    [self setPetVisible:shouldShow];
}

- (void)setPetVisible:(BOOL)visible {
    if (_petIsVisible == visible) return;
    _petIsVisible = visible;
    if (visible) {
        [_panel orderFrontRegardless];
        if (_speechTimer.valid) [_speechPanel orderFront:nil];
        if (_giftActive) {
            [self positionGiftPanel];
            [_giftPanel orderFront:nil];
        }
    } else {
        [self cancelHunt];
        if (_mode != PetModeIdle) [self setMode:PetModeIdle ticks:80 loops:0];
        [_speechPanel orderOut:nil];
        [_giftPanel orderOut:nil];
        [_panel orderOut:nil];
    }
}

- (BOOL)isFrontmostApplicationFullscreen {
    NSRunningApplication *frontmost = NSWorkspace.sharedWorkspace.frontmostApplication;
    if (!frontmost) return NO;
    if (frontmost.processIdentifier == NSProcessInfo.processInfo.processIdentifier) return _lastFullscreenDetected;

    NSArray<NSDictionary *> *windows = CFBridgingRelease(
        CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly |
                                   kCGWindowListExcludeDesktopElements,
                                   kCGNullWindowID));
    for (NSDictionary *window in windows) {
        if ([window[(id)kCGWindowOwnerPID] intValue] != frontmost.processIdentifier) continue;
        if ([window[(id)kCGWindowLayer] integerValue] != 0) continue;
        NSDictionary *boundsDictionary = window[(id)kCGWindowBounds];
        CGRect windowBounds = CGRectZero;
        if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)boundsDictionary,
                                                     &windowBounds)) continue;

        for (NSScreen *screen in NSScreen.screens) {
            NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
            if (!screenNumber) continue;
            CGRect displayBounds = CGDisplayBounds((CGDirectDisplayID)screenNumber.unsignedIntValue);
            const CGFloat edgeTolerance = 4.0;
            const CGFloat allowedMenuBarGap = 60.0;
            CGFloat leftGap = fabs(CGRectGetMinX(windowBounds) - CGRectGetMinX(displayBounds));
            CGFloat rightGap = fabs(CGRectGetMaxX(windowBounds) - CGRectGetMaxX(displayBounds));
            CGFloat topGap = CGRectGetMinY(windowBounds) - CGRectGetMinY(displayBounds);
            CGFloat bottomGap = CGRectGetMaxY(displayBounds) - CGRectGetMaxY(windowBounds);
            BOOL fillsWidth = leftGap <= edgeTolerance && rightGap <= edgeTolerance;
            BOOL fillsHeightExceptMenuBar = topGap >= -edgeTolerance &&
                                            bottomGap >= -edgeTolerance &&
                                            topGap + bottomGap <= allowedMenuBarGap;
            if (fillsWidth && fillsHeightExceptMenuBar) return YES;
        }
    }
    return NO;
}

- (void)updateMouseHunt {
    NSPoint pointer = NSEvent.mouseLocation;
    if (!_hasLastPointer) {
        _hasLastPointer = YES;
        _lastPointer = pointer;
        return;
    }

    NSPoint delta = NSMakePoint(pointer.x - _lastPointer.x, pointer.y - _lastPointer.y);
    CGFloat speed = hypot(delta.x, delta.y);
    CGFloat dot = delta.x * _lastPointerDelta.x + delta.y * _lastPointerDelta.y;
    NSPoint center = NSMakePoint(NSMidX(_panel.frame), NSMidY(_panel.frame));
    CGFloat distance = hypot(pointer.x - center.x, pointer.y - center.y);
    _lastPointer = pointer;
    _lastPointerDelta = delta;

    if (!_cursorHuntEnabled || _paused || _huntCooldownTicks > 0 ||
        _huntAnticipationTicks > 0 || _pounceActive || _mode != PetModeIdle) {
        _lureScore = MAX(0.0, _lureScore - 0.25);
        return;
    }

    CGFloat minimumSpeed = 11.0;
    CGFloat maximumDistance = 430.0 * _scale;
    BOOL inPlayRange = distance > 72.0 * _scale && distance < maximumDistance;
    if (inPlayRange && speed > minimumSpeed) {
        _lureScore += MIN(2.0, speed / 16.0);
        if (dot < 0.0) _lureScore += 1.4;
    } else {
        _lureScore = MAX(0.0, _lureScore - 0.42);
    }

    CGFloat threshold = 10.5;
    if (_lureScore >= threshold) {
        [self noteInteraction];
        [self beginHuntAt:pointer];
    }
}

- (void)beginHuntAt:(NSPoint)pointer {
    _lureScore = 0.0;
    _huntTarget = pointer;
    _huntAnticipationTicks = 11;
    _jumpBaseY = _panel.frame.origin.y;
    [self setMode:PetModeJumping ticks:90 loops:0];
    [self showRow:RowForMode(PetModeJumping) column:0];
}

- (void)tickHuntAnticipation {
    _huntTarget = NSEvent.mouseLocation;
    NSInteger elapsed = 11 - _huntAnticipationTicks;
    [self showRow:RowForMode(PetModeJumping) column:elapsed < 6 ? 0 : 1];
    _huntAnticipationTicks -= 1;
    if (_huntAnticipationTicks <= 0) [self launchPounceAt:_huntTarget];
}

- (void)launchPounceAt:(NSPoint)pointer {
    _pounceActive = YES;
    _jumpBaseY = _panel.frame.origin.y;
    _pounceStartX = _panel.frame.origin.x;
    NSScreen *screen = [self screenForPanel];
    NSRect visible = screen ? screen.visibleFrame : NSMakeRect(-10000, -10000, 20000, 20000);
    CGFloat desiredX = pointer.x - _panel.frame.size.width / 2.0;
    CGFloat maxTravel = 270.0 * _scale;
    desiredX = MAX(_pounceStartX - maxTravel, MIN(desiredX, _pounceStartX + maxTravel));
    _pounceTargetX = MAX(NSMinX(visible), MIN(desiredX, NSMaxX(visible) - _panel.frame.size.width));
    CGFloat travel = fabs(_pounceTargetX - _pounceStartX);
    CGFloat scaledHeight = MIN(_panel.frame.size.height * 0.52,
                               _panel.frame.size.height * 0.28 + travel * 0.10);
    CGFloat availableHeight = NSMaxY(visible) - NSMaxY(_panel.frame) - 8.0;
    _jumpHeight = MAX(0.0, MIN(scaledHeight, availableHeight));
    _jumpTick = 5;
    _jumpTotalTicks = 34;
}

- (void)tickJump {
    // 5 ticks of anticipation, 24 ticks of constant-gravity flight, then 5 ticks to settle.
    const NSInteger anticipationTicks = 5;
    const NSInteger flightTicks = 24;
    const NSInteger landingStart = anticipationTicks + flightTicks;
    _jumpTick = MIN(_jumpTick + 1, _jumpTotalTicks);

    CGFloat lift = 0.0;
    NSInteger column = 0;
    NSPoint origin = _panel.frame.origin;
    if (_jumpTick <= anticipationTicks) {
        column = 0;
    } else if (_jumpTick <= landingStart) {
        CGFloat t = (CGFloat)(_jumpTick - anticipationTicks) / (CGFloat)flightTicks;
        // y = 4H*t*(1-t): a true parabola with constant downward acceleration.
        lift = 4.0 * _jumpHeight * t * (1.0 - t);
        if (t < 0.22) column = 1;
        else if (t < 0.48) column = 2;
        else if (t < 0.78) column = 3;
        else column = 4;
        if (_pounceActive) {
            origin.x = _pounceStartX + (_pounceTargetX - _pounceStartX) * t;
        }
    } else {
        column = 0;
        if (_pounceActive) origin.x = _pounceTargetX;
    }

    origin.y = _jumpBaseY + lift;
    [_panel setFrameOrigin:origin];
    [self showRow:RowForMode(PetModeJumping) column:column];

    if (_jumpTick >= _jumpTotalTicks) {
        if (_pounceActive) {
            _pounceActive = NO;
            _huntCooldownTicks = 190;
            NSPoint pointer = NSEvent.mouseLocation;
            CGFloat horizontalMiss = fabs(pointer.x - NSMidX(_panel.frame));
            CGFloat verticalMiss = fabs(pointer.y - NSMidY(_panel.frame));
            BOOL caught = horizontalMiss < _panel.frame.size.width * 0.42 &&
                          verticalMiss < _panel.frame.size.height * 1.35;
            if (caught) {
                [_stats recordCaught];
                [self startProud];
            } else {
                [_stats recordMissed];
                [self startHissWithLoops:2];
            }
        } else {
            [self chooseNextRoamPhase];
        }
    }
}

- (void)moveHorizontally {
    NSScreen *screen = [self screenForPanel];
    if (!screen) return;
    NSPoint origin = _panel.frame.origin;
    CGFloat direction = _mode == PetModeWalkRight ? 1.0 : -1.0;
    origin.x += 2.1 * _scale * direction;
    NSRect visible = screen.visibleFrame;
    if (origin.x + _panel.frame.size.width >= NSMaxX(visible)) {
      origin.x = NSMaxX(visible) - _panel.frame.size.width;
        [self setMode:PetModeWalkLeft ticks:MAX(1, _phaseTicks) loops:0];
    } else if (origin.x <= NSMinX(visible)) {
        origin.x = NSMinX(visible);
        [self setMode:PetModeWalkRight ticks:MAX(1, _phaseTicks) loops:0];
    }
    origin.y = MAX(NSMinY(visible) + 4, MIN(origin.y, NSMaxY(visible) - _panel.frame.size.height));
    [_panel setFrameOrigin:origin];
}

- (void)chooseNextRoamPhase {
    if (_sleepRequested) {
        [self startSleeping];
        return;
    }
    if (_paused) {
        [self setMode:PetModeIdle ticks:NSIntegerMax loops:0];
        return;
    }
    if (_activityLevel == PetActivityLevelQuiet) {
        [self setMode:PetModeIdle ticks:NSIntegerMax loops:0];
        return;
    }
    // Every active action is followed by an idle window. Cursor hunting only
    // runs while idle, so autonomous actions cannot starve interaction.
    if (_mode != PetModeIdle) {
        [self startTimedIdle];
        return;
    }

    NSInteger roll = RandomBetween(0, 99);
    if (roll < 25) [self startTimedIdle];
    else if (roll < 45) [self setMode:PetModeWalkRight ticks:RandomBetween(72, 120) loops:0];
    else if (roll < 65) [self setMode:PetModeWalkLeft ticks:RandomBetween(72, 120) loops:0];
    else if (roll < 80) [self startWave];
    else if (roll < 90) [self startJump];
    else [self startHissWithLoops:2];
}

- (void)startTimedIdle {
    NSInteger ticks = _activityLevel == PetActivityLevelLively
        ? RandomBetween(36, 72)
        : RandomBetween(72, 144);
    [self setMode:PetModeIdle ticks:ticks loops:0];
}

- (void)setMode:(PetMode)newMode ticks:(NSInteger)ticks loops:(NSInteger)loops {
    if (_mode == PetModeJumping && newMode != PetModeJumping) {
        NSPoint origin = _panel.frame.origin;
        origin.y = _jumpBaseY;
        [_panel setFrameOrigin:origin];
    }
    if (_mode == PetModeHissing && newMode != PetModeHissing) {
        NSPoint origin = _panel.frame.origin;
        origin.x = _hissBaseX;
        [_panel setFrameOrigin:origin];
    }
    _mode = newMode;
    _view.visualScaleX = 1.0;
    _view.visualScaleY = 1.0;
    _view.visualYOffset = 0.0;
    _view.visualRotation = 0.0;
    _view.groundShadowOpacity = 0.0;
    _view.groundShadowScale = 1.0;
    _frameIndex = 0;
    _frameClock = 0;
    _phaseTicks = ticks;
    _transientLoopsRemaining = loops;
    if (newMode == PetModeProud) _view.currentFrame = [_atlas proudFrameAtColumn:0];
    else if (newMode == PetModeSleeping) _view.currentFrame = [_atlas sleepFrameAtColumn:0];
    else [self showRow:RowForMode(newMode) column:0];
}

- (void)renderIdleOrLook {
    NSPoint center = NSMakePoint(NSMidX(_panel.frame), NSMidY(_panel.frame));
    NSPoint pointer = NSEvent.mouseLocation;
    CGFloat dx = pointer.x - center.x;
    CGFloat dy = pointer.y - center.y;
    if (hypot(dx, dy) < 85.0 || _idleLookClock % 96 < 34) {
        [self showRow:0 column:MIN(_frameIndex, 5)];
        return;
    }
    CGFloat degrees = atan2(dx, dy) * 180.0 / M_PI;
    if (degrees < 0) degrees += 360.0;
    NSInteger direction = ((NSInteger)llround(degrees / 22.5)) % 16;
    if (direction < 8) [self showRow:9 column:direction];
    else [self showRow:10 column:direction - 8];
}

- (void)showRow:(NSInteger)row column:(NSInteger)column {
    _view.currentFrame = [_atlas frameAtRow:row column:column];
}

- (void)showSpeechText:(NSString *)text duration:(NSTimeInterval)duration {
    [_speechTimer invalidate];
    _speechTimer = nil;
    _speechView.text = text;
    [self positionSpeechBubble];
    if (_petIsVisible) [_speechPanel orderFront:nil];
    _speechTimer = [NSTimer scheduledTimerWithTimeInterval:duration
                                                   target:self
                                                 selector:@selector(hideSpeechBubble:)
                                                 userInfo:nil
                                                  repeats:NO];
}

- (void)hideSpeechBubble:(NSTimer *)timer {
    if (timer != _speechTimer) return;
    [_speechPanel orderOut:nil];
    _speechTimer = nil;
}

- (void)positionSpeechBubble {
    NSScreen *screen = [self screenForPanel];
    NSRect visible = screen ? screen.visibleFrame : NSScreen.mainScreen.visibleFrame;
    NSSize size = _speechPanel.frame.size;
    CGFloat x = NSMidX(_panel.frame) - size.width / 2.0;
    CGFloat y = NSMaxY(_panel.frame) - 8.0;
    x = MAX(NSMinX(visible) + 4.0, MIN(x, NSMaxX(visible) - size.width - 4.0));
    y = MAX(NSMinY(visible) + 4.0, MIN(y, NSMaxY(visible) - size.height - 4.0));
    [_speechPanel setFrameOrigin:NSMakePoint(x, y)];
}

- (void)positionGiftPanel {
    NSScreen *screen = [self screenForPanel];
    NSRect visible = screen ? screen.visibleFrame : NSScreen.mainScreen.visibleFrame;
    NSSize size = _giftPanel.frame.size;
    CGFloat gap = 3.5 * (_scale / kStandardPetScale);
    CGFloat rightX = NSMaxX(_panel.frame) + gap;
    CGFloat leftX = NSMinX(_panel.frame) - size.width - gap;
    CGFloat x = rightX + size.width <= NSMaxX(visible) - 4.0 ? rightX : leftX;
    x = MAX(NSMinX(visible) + 4.0, MIN(x, NSMaxX(visible) - size.width - 4.0));
    CGFloat y = NSMinY(_panel.frame) + (NSHeight(_panel.frame) - size.height) * 0.42;
    y = MAX(NSMinY(visible) + 4.0, MIN(y, NSMaxY(visible) - size.height - 4.0));
    [_giftPanel setFrameOrigin:NSMakePoint(x, y)];
}

- (void)positionAtBottomRight {
    NSScreen *screen = NSScreen.mainScreen;
    if (!screen) return;
    NSRect visible = screen.visibleFrame;
    [_panel setFrameOrigin:NSMakePoint(NSMaxX(visible) - _panel.frame.size.width - 42,
                                       NSMinY(visible) + 8)];
}

- (void)savePosition {
    NSScreen *screen = [self screenForPanel];
    if (!screen) return;
    NSRect visible = screen.visibleFrame;
    CGFloat availableWidth = MAX(0.0, NSWidth(visible) - NSWidth(_panel.frame));
    CGFloat availableHeight = MAX(0.0, NSHeight(visible) - NSHeight(_panel.frame));
    CGFloat relativeX = availableWidth > 0.0
        ? (_panel.frame.origin.x - NSMinX(visible)) / availableWidth : 0.0;
    CGFloat relativeY = availableHeight > 0.0
        ? (_panel.frame.origin.y - NSMinY(visible)) / availableHeight : 0.0;
    relativeX = MAX(0.0, MIN(1.0, relativeX));
    relativeY = MAX(0.0, MIN(1.0, relativeY));

    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    [defaults setBool:YES forKey:@"petPositionSaved"];
    [defaults setDouble:relativeX forKey:@"petPositionRelativeX"];
    [defaults setDouble:relativeY forKey:@"petPositionRelativeY"];
    NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
    if (screenNumber) [defaults setInteger:screenNumber.integerValue forKey:@"petPositionDisplayID"];
}

- (BOOL)restorePosition {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    if (![defaults boolForKey:@"petPositionSaved"]) return NO;

    NSScreen *targetScreen = nil;
    NSInteger savedDisplayID = [defaults integerForKey:@"petPositionDisplayID"];
    for (NSScreen *screen in NSScreen.screens) {
        NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
        if (screenNumber && screenNumber.integerValue == savedDisplayID) {
            targetScreen = screen;
            break;
        }
    }
    if (!targetScreen) targetScreen = NSScreen.mainScreen;
    if (!targetScreen) return NO;

    CGFloat relativeX = MAX(0.0, MIN(1.0, [defaults doubleForKey:@"petPositionRelativeX"]));
    CGFloat relativeY = MAX(0.0, MIN(1.0, [defaults doubleForKey:@"petPositionRelativeY"]));
    NSRect visible = targetScreen.visibleFrame;
    CGFloat availableWidth = MAX(0.0, NSWidth(visible) - NSWidth(_panel.frame));
    CGFloat availableHeight = MAX(0.0, NSHeight(visible) - NSHeight(_panel.frame));
    [_panel setFrameOrigin:NSMakePoint(NSMinX(visible) + relativeX * availableWidth,
                                       NSMinY(visible) + relativeY * availableHeight)];
    return YES;
}

- (void)clampToCurrentScreen {
    NSScreen *screen = [self screenForPanel];
    if (!screen) return;
    NSRect visible = screen.visibleFrame;
    NSPoint origin = _panel.frame.origin;
    origin.x = MAX(NSMinX(visible), MIN(origin.x, NSMaxX(visible) - _panel.frame.size.width));
    origin.y = MAX(NSMinY(visible), MIN(origin.y, NSMaxY(visible) - _panel.frame.size.height));
    [_panel setFrameOrigin:origin];
}

- (NSScreen *)screenForPanel {
    NSPoint center = NSMakePoint(NSMidX(_panel.frame), NSMidY(_panel.frame));
    for (NSScreen *screen in NSScreen.screens) {
        if (NSPointInRect(center, screen.frame)) return screen;
    }
    return NSScreen.mainScreen;
}
- (void)showStats { [_statsWindowController show]; }
- (void)saveStats { [_stats save]; }
@end

@interface AppDelegate : NSObject <NSApplicationDelegate, NSMenuDelegate>
@end

@implementation AppDelegate {
    PetController *_controller;
    NSStatusItem *_statusItem;
    NSMenuItem *_pauseItem;
    NSMenuItem *_clickThroughItem;
    NSMenuItem *_cursorHuntItem;
    NSMenuItem *_sleepItem;
    NSMenu *_visibilityMenu;
    NSMenu *_activityMenu;
    NSMenuItem *_loginItem;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    SpriteAtlas *atlas = [[SpriteAtlas alloc] initWithBundle:NSBundle.mainBundle];
    if (!atlas) {
        [self showFatalError:@"无法读取 spritesheet.png，应用包可能不完整。"];
        return;
    }
    _controller = [[PetController alloc] initWithAtlas:atlas];
    [self configureStatusMenu];
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    [_controller savePosition];
    [_controller saveStats];
}

- (NSMenuItem *)item:(NSString *)title action:(SEL)action key:(NSString *)key {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:key];
    item.target = self;
    return item;
}

- (void)configureStatusMenu {
    _statusItem = [NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];
    _statusItem.button.title = @"🐾";
    _statusItem.button.toolTip = @"哈气桑多涅桌面宠物";
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"哈气桑多涅"];
    menu.delegate = self;
    [menu addItem:[self item:@"挥爪" action:@selector(wave:) key:@""]];
    [menu addItem:[self item:@"得意一下" action:@selector(proud:) key:@""]];
    [menu addItem:[self item:@"跳一下" action:@selector(jump:) key:@""]];
    [menu addItem:[self item:@"哈气！" action:@selector(hiss:) key:@""]];
    [menu addItem:[self item:@"让她找找看" action:@selector(findGift:) key:@""]];
    _sleepItem = [self item:@"让她睡觉" action:@selector(toggleSleep:) key:@""];
    [menu addItem:_sleepItem];
    [menu addItem:[self item:@"多涅小记…" action:@selector(showStats:) key:@""]];
    [menu addItem:NSMenuItem.separatorItem];
    _cursorHuntItem = [self item:@"自动扑向鼠标" action:@selector(toggleCursorHunt:) key:@""];
    [menu addItem:_cursorHuntItem];
    _pauseItem = [self item:@"暂停移动" action:@selector(togglePause:) key:@""];
    [menu addItem:_pauseItem];
    _clickThroughItem = [self item:@"鼠标点击穿透" action:@selector(toggleClickThrough:) key:@""];
    [menu addItem:_clickThroughItem];

    _visibilityMenu = [[NSMenu alloc] initWithTitle:@"宠物显示"];
    NSArray *visibilityOptions = @[
        @[@"始终显示", @(PetVisibilityModeAlwaysShow)],
        @[@"隐藏宠物", @(PetVisibilityModeAlwaysHide)],
        @[@"进入全屏后隐藏", @(PetVisibilityModeHideInFullscreen)]
    ];
    for (NSArray *option in visibilityOptions) {
        NSMenuItem *visibilityItem = [self item:option[0] action:@selector(changeVisibility:) key:@""];
        visibilityItem.representedObject = option[1];
        [_visibilityMenu addItem:visibilityItem];
    }
    NSMenuItem *visibilityRoot = [[NSMenuItem alloc] initWithTitle:@"宠物显示" action:nil keyEquivalent:@""];
    visibilityRoot.submenu = _visibilityMenu;
    [menu addItem:visibilityRoot];

    _activityMenu = [[NSMenu alloc] initWithTitle:@"活动性"];
    NSArray *activityOptions = @[
        @[@"默认", @(PetActivityLevelDefault)],
        @[@"活泼", @(PetActivityLevelLively)],
        @[@"安静（不主动活动）", @(PetActivityLevelQuiet)]
    ];
    for (NSArray *option in activityOptions) {
        NSMenuItem *activityItem = [self item:option[0] action:@selector(changeActivity:) key:@""];
        activityItem.representedObject = option[1];
        [_activityMenu addItem:activityItem];
    }
    NSMenuItem *activityRoot = [[NSMenuItem alloc] initWithTitle:@"活动性" action:nil keyEquivalent:@""];
    activityRoot.submenu = _activityMenu;
    [menu addItem:activityRoot];

    NSMenu *sizeMenu = [[NSMenu alloc] initWithTitle:@"宠物大小"];
    NSArray *sizes = @[
        @[@"小 75%", @0.5625],
        @[@"标准 100%", @0.75],
        @[@"大 125%", @0.9375],
        @[@"超大 150%", @1.125]
    ];
    for (NSArray *pair in sizes) {
        NSMenuItem *sizeItem = [self item:pair[0] action:@selector(changeSize:) key:@""];
        sizeItem.representedObject = pair[1];
        [sizeMenu addItem:sizeItem];
    }
    NSMenuItem *sizeRoot = [[NSMenuItem alloc] initWithTitle:@"宠物大小" action:nil keyEquivalent:@""];
    sizeRoot.submenu = sizeMenu;
    [menu addItem:sizeRoot];
    [menu addItem:[self item:@"回到屏幕右下角" action:@selector(resetPosition:) key:@""]];

    if (@available(macOS 13.0, *)) {
        _loginItem = [self item:@"登录时自动启动" action:@selector(toggleLaunchAtLogin:) key:@""];
        [menu addItem:_loginItem];
    }
    [menu addItem:[self item:@"使用帮助…" action:@selector(showHelp:) key:@""]];
    [menu addItem:NSMenuItem.separatorItem];
    [menu addItem:[self item:@"退出哈气桑多涅" action:@selector(quit:) key:@""]];
    _statusItem.menu = menu;
}

- (void)menuWillOpen:(NSMenu *)menu {
    _pauseItem.title = _controller.paused ? @"继续移动" : @"暂停移动";
    _clickThroughItem.state = _controller.clickThrough ? NSControlStateValueOn : NSControlStateValueOff;
    _cursorHuntItem.state = _controller.cursorHuntEnabled ? NSControlStateValueOn : NSControlStateValueOff;
    _sleepItem.title = _controller.isSleeping ? @"叫醒她" : @"让她睡觉";
    for (NSMenuItem *item in _visibilityMenu.itemArray) {
        item.state = [item.representedObject integerValue] == _controller.visibilityMode
            ? NSControlStateValueOn : NSControlStateValueOff;
    }
    for (NSMenuItem *item in _activityMenu.itemArray) {
        item.state = [item.representedObject integerValue] == _controller.activityLevel
            ? NSControlStateValueOn : NSControlStateValueOff;
    }
    if (@available(macOS 13.0, *)) {
        _loginItem.state = SMAppService.mainAppService.status == SMAppServiceStatusEnabled ? NSControlStateValueOn : NSControlStateValueOff;
    }
}

- (void)wave:(id)sender { [_controller triggerWave]; }
- (void)proud:(id)sender { [_controller triggerProud]; }
- (void)jump:(id)sender { [_controller triggerJump]; }
- (void)hiss:(id)sender { [_controller triggerHiss]; }
- (void)findGift:(id)sender { [_controller triggerGiftDiscovery]; }
- (void)toggleSleep:(id)sender { [_controller toggleSleep]; }
- (void)showStats:(id)sender { [_controller showStats]; }
- (void)toggleCursorHunt:(id)sender { [_controller setCursorHuntEnabled:!_controller.cursorHuntEnabled]; }
- (void)resetPosition:(id)sender { [_controller resetPosition]; }
- (void)togglePause:(id)sender { [_controller setPaused:!_controller.paused]; }
- (void)toggleClickThrough:(id)sender { [_controller setClickThrough:!_controller.clickThrough]; }
- (void)changeVisibility:(NSMenuItem *)sender {
    [_controller setVisibilityMode:(PetVisibilityMode)[sender.representedObject integerValue]];
}
- (void)changeActivity:(NSMenuItem *)sender {
    [_controller setActivityLevel:(PetActivityLevel)[sender.representedObject integerValue]];
}
- (void)changeSize:(NSMenuItem *)sender { [_controller setPetScale:[sender.representedObject doubleValue]]; }
- (void)toggleLaunchAtLogin:(id)sender {
    if (@available(macOS 13.0, *)) {
        SMAppService *service = SMAppService.mainAppService;
        NSError *error = nil;
        BOOL ok = service.status == SMAppServiceStatusEnabled
            ? [service unregisterAndReturnError:&error]
            : [service registerAndReturnError:&error];
        if (!ok) {
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = @"无法修改登录启动设置";
            alert.informativeText = error.localizedDescription ?: @"未知错误";
            [alert runModal];
        }
    }
}
- (void)showHelp:(id)sender { ShowHelpWindow(); }
- (void)quit:(id)sender { [NSApp terminate:nil]; }

- (void)showFatalError:(NSString *)message {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"哈气桑多涅启动失败";
    alert.informativeText = message;
    [alert runModal];
    [NSApp terminate:nil];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        AppDelegate *delegate = [[AppDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
