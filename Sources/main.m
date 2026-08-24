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
    PetModeProud
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
        case PetModeProud: return 6;
    }
}

static BOOL IsTransientMode(PetMode mode) {
    return mode >= PetModeWaving;
}

static NSInteger RandomBetween(NSInteger lower, NSInteger upper) {
    return lower + (NSInteger)arc4random_uniform((uint32_t)(upper - lower + 1));
}

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
    AppendHelpParagraph(text, @"•  拖动她：移动到喜欢的位置\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  多戳她几下：她可能会不耐烦\n", [NSFont systemFontOfSize:14.0], 4.0, YES);
    AppendHelpParagraph(text, @"•  在她附近快速晃动鼠标：她可能会盯住并扑过去\n", [NSFont systemFontOfSize:14.0], 10.0, YES);
    AppendHelpParagraph(text, @"扑到鼠标后，她会露出得意脸；扑空则会生气哈气。\n", [NSFont systemFontOfSize:14.0], 18.0, NO);

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
@end

@implementation SpriteAtlas {
    NSImage *_source;
    NSMutableDictionary<NSString *, NSImage *> *_cache;
    NSArray<NSImage *> *_proudFrames;
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
    NSRect bubbleRect = NSMakeRect(2.0, 12.0, NSWidth(self.bounds) - 4.0, NSHeight(self.bounds) - 14.0);
    NSBezierPath *tail = [NSBezierPath bezierPath];
    CGFloat centerX = NSMidX(self.bounds);
    [tail moveToPoint:NSMakePoint(centerX - 10.0, 14.0)];
    [tail lineToPoint:NSMakePoint(centerX, 2.0)];
    [tail lineToPoint:NSMakePoint(centerX + 8.0, 14.0)];
    [tail closePath];
    NSColor *fillColor = [NSColor colorWithRed:1.0 green:0.97 blue:0.94 alpha:0.98];
    NSColor *strokeColor = [NSColor colorWithRed:0.30 green:0.16 blue:0.17 alpha:1.0];
    [fillColor setFill];
    [strokeColor setStroke];
    tail.lineWidth = 2.0;
    [tail fill];
    [tail stroke];

    NSBezierPath *bubble = [NSBezierPath bezierPathWithRoundedRect:bubbleRect xRadius:15.0 yRadius:15.0];
    bubble.lineWidth = 2.0;
    [fillColor setFill];
    [strokeColor setStroke];
    [bubble fill];
    [bubble stroke];

    NSDictionary *attributes = @{
        NSFontAttributeName: [NSFont boldSystemFontOfSize:16.0],
        NSForegroundColorAttributeName: strokeColor
    };
    NSSize textSize = [self.text sizeWithAttributes:attributes];
    NSPoint textPoint = NSMakePoint(NSMidX(bubbleRect) - textSize.width / 2.0,
                                    NSMidY(bubbleRect) - textSize.height / 2.0);
    [self.text drawAtPoint:textPoint withAttributes:attributes];
}
@end

@class PetController;

@interface PetView : NSView
@property(nonatomic, strong) NSImage *currentFrame;
@property(nonatomic, weak) PetController *controller;
@end

@interface PetController : NSObject
@property(nonatomic, readonly) BOOL paused;
@property(nonatomic, readonly) BOOL clickThrough;
@property(nonatomic, readonly) CGFloat scale;
@property(nonatomic, readonly) BOOL cursorHuntEnabled;
@property(nonatomic, readonly) PetVisibilityMode visibilityMode;
@property(nonatomic, readonly) PetActivityLevel activityLevel;
- (instancetype)initWithAtlas:(SpriteAtlas *)atlas;
- (void)setPaused:(BOOL)paused;
- (void)setClickThrough:(BOOL)enabled;
- (void)setPetScale:(CGFloat)scale;
- (void)resetPosition;
- (void)triggerWave;
- (void)triggerProud;
- (void)triggerJump;
- (void)triggerHiss;
- (void)triggerWaiting;
- (void)triggerWorking;
- (void)triggerReview;
- (void)setCursorHuntEnabled:(BOOL)enabled;
- (void)setVisibilityMode:(PetVisibilityMode)mode;
- (void)setActivityLevel:(PetActivityLevel)level;
- (void)petMouseDownAt:(NSPoint)location;
- (void)petMouseDraggedTo:(NSPoint)location;
- (void)petMouseUpWithClickCount:(NSInteger)clickCount;
@end

@implementation PetView {
    NSPoint _mouseDownLocation;
    BOOL _didDrag;
}

- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (void)setCurrentFrame:(NSImage *)currentFrame {
    _currentFrame = currentFrame;
    self.needsDisplay = YES;
}
- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    if (!_currentFrame) return;
    [_currentFrame drawInRect:self.bounds
                     fromRect:NSZeroRect
                    operation:NSCompositingOperationSourceOver
                     fraction:1.0
               respectFlipped:YES
                        hints:@{NSImageHintInterpolation: @(NSImageInterpolationHigh)}];
}
- (void)mouseDown:(NSEvent *)event {
    _mouseDownLocation = NSEvent.mouseLocation;
    _didDrag = NO;
    [self.controller petMouseDownAt:_mouseDownLocation];
}
- (void)mouseDragged:(NSEvent *)event {
    NSPoint location = NSEvent.mouseLocation;
    if (hypot(location.x - _mouseDownLocation.x, location.y - _mouseDownLocation.y) > 3.0) {
        _didDrag = YES;
    }
    [self.controller petMouseDraggedTo:location];
}
- (void)mouseUp:(NSEvent *)event {
    [self.controller petMouseUpWithClickCount:_didDrag ? 0 : event.clickCount];
}
- (void)rightMouseDown:(NSEvent *)event {
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"哈气桑多涅"];
    NSMenuItem *proud = [[NSMenuItem alloc] initWithTitle:@"得意一下" action:@selector(contextProud:) keyEquivalent:@""];
    proud.target = self;
    [menu addItem:proud];
    NSMenuItem *hiss = [[NSMenuItem alloc] initWithTitle:@"哈气！" action:@selector(contextHiss:) keyEquivalent:@""];
    hiss.target = self;
    [menu addItem:hiss];
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
        @[@"默认（约 65% 待机）", @(PetActivityLevelDefault)],
        @[@"活泼（约 35% 待机）", @(PetActivityLevelLively)],
        @[@"安静（始终待机）", @(PetActivityLevelQuiet)]
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
- (void)contextReset:(id)sender { [self.controller resetPosition]; }
- (void)contextChangeVisibility:(NSMenuItem *)sender {
    [self.controller setVisibilityMode:(PetVisibilityMode)[sender.representedObject integerValue]];
}
- (void)contextChangeActivity:(NSMenuItem *)sender {
    [self.controller setActivityLevel:(PetActivityLevel)[sender.representedObject integerValue]];
}
- (void)contextHelp:(id)sender { ShowHelpWindow(); }
- (void)contextQuit:(id)sender { [NSApp terminate:nil]; }
@end

@implementation PetController {
    SpriteAtlas *_atlas;
    PetPanel *_panel;
    PetView *_view;
    NSPanel *_speechPanel;
    SpeechBubbleView *_speechView;
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
}

- (instancetype)initWithAtlas:(SpriteAtlas *)atlas {
    self = [super init];
    if (!self) return nil;
    _atlas = atlas;
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

    _speechPanel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, 132, 62)
                                              styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    _speechView = [[SpeechBubbleView alloc] initWithFrame:NSMakeRect(0, 0, 132, 62)];
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

    [self positionAtBottomRight];
    [self setMode:PetModeIdle ticks:80 loops:0];
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
    [self clampToCurrentScreen];
    [self positionSpeechBubble];
}

- (void)resetPosition {
    [self positionAtBottomRight];
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
    [self cancelHunt];
    [self setMode:PetModeWaving ticks:90 loops:2];
}
- (void)triggerProud {
    [self cancelHunt];
    [self setMode:PetModeProud ticks:90 loops:2];
    [self showSpeechText:@"多涅多涅~" duration:1.8];
}
- (void)triggerJump {
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
    [self startHissWithLoops:3];
}
- (void)startHissWithLoops:(NSInteger)loops {
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
- (void)triggerWaiting { [self setMode:PetModeWaiting ticks:90 loops:2]; }
- (void)triggerWorking { [self setMode:PetModeWorking ticks:90 loops:2]; }
- (void)triggerReview { [self setMode:PetModeReview ticks:90 loops:2]; }

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
    if (_huntAnticipationTicks > 0 || _pounceActive) {
        [self cancelHunt];
        [self setMode:PetModeIdle ticks:80 loops:0];
    }
    _dragging = NO;
    _dragOffset = NSMakePoint(location.x - _panel.frame.origin.x,
                              location.y - _panel.frame.origin.y);
}
- (void)petMouseDraggedTo:(NSPoint)location {
    _dragging = YES;
    [_panel setFrameOrigin:NSMakePoint(location.x - _dragOffset.x,
                                       location.y - _dragOffset.y)];
}
- (void)petMouseUpWithClickCount:(NSInteger)clickCount {
    _dragging = NO;
    [self clampToCurrentScreen];
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

- (void)tick:(NSTimer *)timer {
    _fullscreenCheckClock += 1;
    if (_fullscreenCheckClock >= 12) {
        _fullscreenCheckClock = 0;
        [self refreshVisibility];
    }
    if (!_petIsVisible) return;
    if (_dragging) return;
    if (_huntCooldownTicks > 0) _huntCooldownTicks -= 1;
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
    } else {
        [self cancelHunt];
        if (_mode != PetModeIdle) [self setMode:PetModeIdle ticks:80 loops:0];
        [_speechPanel orderOut:nil];
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
    if (_lureScore >= threshold) [self beginHuntAt:pointer];
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
            if (caught) [self triggerProud];
            else [self startHissWithLoops:2];
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
        [self setMode:PetModeWalkLeft ticks:RandomBetween(80, 180) loops:0];
    } else if (origin.x <= NSMinX(visible)) {
        origin.x = NSMinX(visible);
        [self setMode:PetModeWalkRight ticks:RandomBetween(80, 180) loops:0];
    }
    origin.y = MAX(NSMinY(visible) + 4, MIN(origin.y, NSMaxY(visible) - _panel.frame.size.height));
    [_panel setFrameOrigin:origin];
}

- (void)chooseNextRoamPhase {
    if (_paused) {
        [self setMode:PetModeIdle ticks:NSIntegerMax loops:0];
        return;
    }
    if (_activityLevel == PetActivityLevelQuiet) {
        [self setMode:PetModeIdle ticks:NSIntegerMax loops:0];
        return;
    }
    NSInteger roll = RandomBetween(0, 99);
    if (_activityLevel == PetActivityLevelLively) {
        if (roll < 42) [self setMode:PetModeIdle ticks:RandomBetween(60, 150) loops:0];
        else if (roll < 69) [self setMode:PetModeWalkRight ticks:RandomBetween(90, 210) loops:0];
        else if (roll < 96) [self setMode:PetModeWalkLeft ticks:RandomBetween(90, 210) loops:0];
        else [self triggerWave];
        return;
    }
    if (roll < 50) [self setMode:PetModeIdle ticks:RandomBetween(144, 360) loops:0];
    else if (roll < 73) [self setMode:PetModeWalkRight ticks:RandomBetween(90, 210) loops:0];
    else if (roll < 96) [self setMode:PetModeWalkLeft ticks:RandomBetween(90, 210) loops:0];
    else [self triggerWave];
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
    _frameIndex = 0;
    _frameClock = 0;
    _phaseTicks = ticks;
    _transientLoopsRemaining = loops;
    if (newMode == PetModeProud) _view.currentFrame = [_atlas proudFrameAtColumn:0];
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

- (void)positionAtBottomRight {
    NSScreen *screen = NSScreen.mainScreen;
    if (!screen) return;
    NSRect visible = screen.visibleFrame;
    [_panel setFrameOrigin:NSMakePoint(NSMaxX(visible) - _panel.frame.size.width - 42,
                                       NSMinY(visible) + 8)];
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
@end

@interface AppDelegate : NSObject <NSApplicationDelegate, NSMenuDelegate>
@end

@implementation AppDelegate {
    PetController *_controller;
    NSStatusItem *_statusItem;
    NSMenuItem *_pauseItem;
    NSMenuItem *_clickThroughItem;
    NSMenuItem *_cursorHuntItem;
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
        @[@"默认（约 65% 待机）", @(PetActivityLevelDefault)],
        @[@"活泼（约 35% 待机）", @(PetActivityLevelLively)],
        @[@"安静（始终待机）", @(PetActivityLevelQuiet)]
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
